FROM php:8.3-apache
RUN apt-get update \
 && apt-get install -y --no-install-recommends libcurl4-openssl-dev libonig-dev \
 && docker-php-ext-install pdo_mysql mbstring curl \
 && rm -rf /var/lib/apt/lists/* \
 && printf "upload_max_filesize=20M\npost_max_size=22M\nmemory_limit=256M\nexpose_php=Off\n" > /usr/local/etc/php/conf.d/ocular.ini
COPY api/ /var/www/html/
COPY config/ /var/www/config/
COPY src/ /var/www/src/
COPY lib/ /var/www/lib/
COPY database/ /var/www/database/
COPY schemas/ /var/www/schemas/
COPY scripts/ /var/www/scripts/
COPY migrate.php worker.php /var/www/
RUN mkdir -p /var/www/storage && chown -R www-data:www-data /var/www/storage
CMD ["sh", "-c", "php /var/www/migrate.php && apache2-foreground"]
