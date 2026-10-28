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
    // WhatsApp integrado (Evolution API). Com o Docker Desktop: docker compose up -d evolution
    'EVOLUTION_URL' => 'http://127.0.0.1:8081',
    'EVOLUTION_API_KEY' => '', // o mesmo valor de EVOLUTION_API_KEY usado no compose
    // Como o servidor Evolution (dentro do Docker) enxerga esta instalação do XAMPP.
    'EVOLUTION_WEBHOOK_BASE' => 'http://host.docker.internal/Otica-SD/app/public/api',
];
