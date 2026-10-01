<?php
require '/var/www/config/database.php';
foreach ([[null,'Administrador geral','admin@sistema.test','admin123','platform_admin'],[1,'Ana Silva','dono@otica.test','otica123','company_admin'],[2,'Bruno Costa','dono@segunda.test','otica123','company_admin']] as $u) {
    query('INSERT IGNORE INTO users(company_id,name,email,password_hash,role) VALUES(?,?,?,?,?)',[$u[0],$u[1],$u[2],password_hash($u[3], PASSWORD_DEFAULT),$u[4]]);
}
