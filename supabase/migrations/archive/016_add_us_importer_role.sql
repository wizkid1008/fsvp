-- 016_add_us_importer_role.sql — add us_importer to app_role enum

alter type app_role add value if not exists 'us_importer';
