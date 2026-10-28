<?php
// Ponte para instalações sem proxy (XAMPP/hospedagem compartilhada): a interface chama ./api/index.php
// e esta ponte executa a API real em app/api. No Docker, o Nginx encaminha /api/ diretamente.
require __DIR__ . '/../../api/index.php';
