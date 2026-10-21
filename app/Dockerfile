FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql
COPY api/ /var/www/html/
COPY config/ /var/www/config/
COPY src/ /var/www/src/
COPY seed.php /var/www/seed.php
COPY worker.php /var/www/worker.php
CMD ["sh", "-c", "php /var/www/seed.php && apache2-foreground"]
