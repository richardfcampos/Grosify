-- Custom SQL migration file, put your code below! --

-- Sequence global e trigger que carimba server_version em cada INSERT/UPDATE
-- das tabelas sync. Cursor monotônico para o pull incremental (fase 3).

CREATE SEQUENCE IF NOT EXISTS sync_version_seq;

CREATE OR REPLACE FUNCTION assign_server_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.server_version := nextval('sync_version_seq');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_server_version
  BEFORE INSERT OR UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER item_barcodes_server_version
  BEFORE INSERT OR UPDATE ON item_barcodes
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER stores_server_version
  BEFORE INSERT OR UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();
