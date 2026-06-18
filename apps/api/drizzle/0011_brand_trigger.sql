-- Custom SQL migration file, put your code below! --

CREATE TRIGGER item_brands_server_version
  BEFORE INSERT OR UPDATE ON item_brands
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();
