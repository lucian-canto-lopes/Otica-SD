<?php
// Copie para config/local.php e ajuste para a sua instalação (XAMPP, hospedagem compartilhada etc.).
// Variáveis de ambiente com o mesmo nome têm prioridade sobre estes valores.
return [
    'DB_HOST' => '127.0.0.1',
    'DB_PORT' => '3306',
    'DB_NAME' => 'ocular',
    'DB_USER' => 'root',
    'DB_PASS' => '',
    // URL pública da API, usada nos webhooks do WhatsApp/Meta. Ex.: https://crm.suaotica.com.br/app/public/api
    'PUBLIC_URL' => '',
    'MAX_UPLOAD_MB' => '15',
    'APP_DEBUG' => '0',
];
