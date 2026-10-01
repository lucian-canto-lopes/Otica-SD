<?php
declare(strict_types=1);
require '/var/www/config/database.php';
session_set_cookie_params(['httponly'=>true,'samesite'=>'Strict','path'=>'/']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function respond($data, int $code=200): never { http_response_code($code); echo json_encode($data,JSON_UNESCAPED_UNICODE); exit; }
function fail(string $message,int $code=422): never { respond(['error'=>$message],$code); }
function required(array $d,string $key,int $max=120): string { $v=trim((string)($d[$key]??'')); if($v==='' || strlen($v)>$max) fail('Preencha corretamente: '.$key); return $v; }
function integer($value, int $min=1): int { if(filter_var($value,FILTER_VALIDATE_INT)===false || (int)$value<$min || (int)$value>1000000) fail('Quantidade ou identificador inválido.'); return (int)$value; }
function cents($value): int { if(!preg_match('/^\d{1,8}(\.\d{1,2})?$/',(string)$value)) fail('Valor monetário inválido.'); return (int)round((float)$value*100); }
try {
 $action=$_GET['action']??'me'; $method=$_SERVER['REQUEST_METHOD'];
 if(!in_array($method,['GET','POST','PATCH'],true)) fail('Método não permitido.',405);
 $d=[]; if($method!=='GET') { $d=json_decode(file_get_contents('php://input'),true); if(!is_array($d)) fail('JSON inválido.'); }
 if($action==='login' && $method==='POST') {
   $u=query('SELECT * FROM users WHERE email=?',[$d['email']??''])->fetch();
   if(!$u || !password_verify($d['password']??'',$u['password_hash'])) fail('E-mail ou senha incorretos.',401);
   session_regenerate_id(true); $_SESSION['uid']=$u['id']; $_SESSION['csrf']=bin2hex(random_bytes(24)); respond(['ok'=>true]);
 }
 $u=query('SELECT id,company_id,name,email,role FROM users WHERE id=?',[$_SESSION['uid']??0])->fetch();
 if(!$u) fail('Entre para continuar.',401);
 if($method!=='GET' && !hash_equals($_SESSION['csrf']??'',$_SERVER['HTTP_X_CSRF_TOKEN']??'!')) fail('Sessão inválida. Entre novamente.',403);
 if($action==='logout' && $method==='POST') { session_destroy(); respond(['ok'=>true]); }
 $admin=$u['role']==='platform_admin';
 if(!$admin) { $company=query('SELECT * FROM companies WHERE id=?',[$u['company_id']])->fetch(); if($company['status']==='blocked') fail('A assinatura desta ótica está suspensa.',403); }
 if($action==='me' && $method==='GET') respond(['user'=>$u,'csrf'=>$_SESSION['csrf'],'company'=>$company??null]);
 if($action==='companies') {
   if(!$admin) fail('Acesso restrito ao administrador geral.',403);
   if($method==='GET') respond(query('SELECT id,name,document,plan,status FROM companies ORDER BY id DESC')->fetchAll());
   $status=$d['status']??'trial'; if(!in_array($status,['trial','active','blocked'],true)) fail('Status inválido.');
   if($method==='PATCH') { query('UPDATE companies SET status=? WHERE id=?',[$status,integer($d['id']??0)]); respond(['ok'=>true]); }
   $name=required($d,'name'); $email=required($d,'email',190); $password=required($d,'password',72);
   if(!filter_var($email,FILTER_VALIDATE_EMAIL) || strlen($password)<8) fail('Informe e-mail válido e senha com pelo menos 8 caracteres.');
   db()->beginTransaction(); query('INSERT INTO companies(name,document,plan,status) VALUES(?,?,?,?)',[$name,substr($d['document']??'',0,30),required($d,'plan',40),$status]); $id=db()->lastInsertId();
   query('INSERT INTO users(company_id,name,email,password_hash,role) VALUES(?,?,?,?,?)',[$id,$name,$email,password_hash($password,PASSWORD_DEFAULT),'company_admin']); db()->commit(); respond(['ok'=>true],201);
 }
 if($admin) fail('Use uma conta de ótica para acessar a operação.',403);
 $tenant=(int)$u['company_id'];
 if($action==='dashboard' && $method==='GET') respond(['clients'=>query('SELECT COUNT(*) FROM clients WHERE company_id=?',[$tenant])->fetchColumn(),'products'=>query('SELECT COALESCE(SUM(stock),0) FROM products WHERE company_id=?',[$tenant])->fetchColumn(),'revenue'=>query('SELECT COALESCE(SUM(total),0) FROM sales WHERE company_id=?',[$tenant])->fetchColumn(),'receivable'=>query('SELECT COALESCE(SUM(total-paid),0) FROM sales WHERE company_id=?',[$tenant])->fetchColumn()]);
 if(!in_array($action,['clients','products','sales','orders'],true)) fail('Recurso não encontrado.',404);
 if($method==='GET') {
   $sql=match($action) {
    'sales'=>'SELECT s.*,c.name AS client,p.name AS product FROM sales s JOIN clients c ON c.id=s.client_id JOIN products p ON p.id=s.product_id WHERE s.company_id=? ORDER BY s.id DESC',
    'orders'=>'SELECT o.*,c.name AS client FROM orders o JOIN clients c ON c.id=o.client_id WHERE o.company_id=? ORDER BY o.id DESC',
    default=>"SELECT * FROM $action WHERE company_id=? ORDER BY id DESC"
   }; respond(query($sql,[$tenant])->fetchAll());
 }
 if($method==='PATCH') {
   if($action!=='orders') fail('Método não permitido.',405);
   $status=$d['status']??''; if(!in_array($status,['received','production','ready','delivered'],true)) fail('Etapa inválida.');
   query('UPDATE orders SET status=? WHERE id=? AND company_id=?',[$status,integer($d['id']??0),$tenant]); respond(['ok'=>true]);
 }
 if($action==='clients') query('INSERT INTO clients(company_id,name,phone,notes) VALUES(?,?,?,?)',[$tenant,required($d,'name'),substr($d['phone']??'',0,30),substr($d['notes']??'',0,2000)]);
 if($action==='products') query('INSERT INTO products(company_id,name,category,price,stock) VALUES(?,?,?,?,?)',[$tenant,required($d,'name'),required($d,'category',60),cents($d['price']??'')/100,integer($d['stock']??0,0)]);
 if(in_array($action,['sales','orders'],true)) {
   $client=integer($d['client_id']??0); if(!query('SELECT id FROM clients WHERE id=? AND company_id=?',[$client,$tenant])->fetch()) fail('Cliente não encontrado.');
   if($action==='sales') {
     $qty=integer($d['quantity']??0); $paid=cents($d['paid']??'0'); db()->beginTransaction();
     $p=query('SELECT * FROM products WHERE id=? AND company_id=? FOR UPDATE',[integer($d['product_id']??0),$tenant])->fetch();
     if(!$p || $p['stock']<$qty) { db()->rollBack(); fail('Produto indisponível ou estoque insuficiente.'); }
     $total=cents($p['price'])*$qty; if($paid>$total || $total>999999999999) { db()->rollBack(); fail('Valor pago ou total inválido.'); }
     query('UPDATE products SET stock=stock-? WHERE id=?',[$qty,$p['id']]); query('INSERT INTO sales(company_id,client_id,product_id,quantity,total,paid) VALUES(?,?,?,?,?,?)',[$tenant,$client,$p['id'],$qty,$total/100,$paid/100]); db()->commit();
   } else {
     $date=DateTimeImmutable::createFromFormat('!Y-m-d',$d['delivery']??''); if(!$date || $date->format('Y-m-d')!==$d['delivery']) fail('Data inválida.');
     query('INSERT INTO orders(company_id,client_id,description,prescription,delivery) VALUES(?,?,?,?,?)',[$tenant,$client,required($d,'description',500),substr($d['prescription']??'',0,2000),$d['delivery']]);
   }
 }
 respond(['ok'=>true],201);
} catch(Throwable $e) {
 try { if(db()->inTransaction()) db()->rollBack(); } catch(Throwable $ignored) {}
 error_log($e->getMessage());
 fail($e instanceof PDOException && $e->getCode()==='23000'?'Registro duplicado ou referência inválida.':'Não foi possível concluir a operação.',500);
}
