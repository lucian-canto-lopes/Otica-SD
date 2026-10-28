FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql \
 && printf "upload_max_filesize=20M\npost_max_size=22M\nmemory_limit=256M\nexpose_php=Off\n" > /usr/local/etc/php/conf.d/ocular.ini
COPY api/ /var/www/html/
COPY config/ /var/www/config/
COPY src/ /var/www/src/
COPY lib/ /var/www/lib/
COPY database/ /var/www/database/
COPY scripts/ /var/www/scripts/
COPY migrate.php worker.php /var/www/
RUN mkdir -p /var/www/storage && chown -R www-data:www-data /var/www/storage
CMD ["sh", "-c", "php /var/www/migrate.php && apache2-foreground"]
