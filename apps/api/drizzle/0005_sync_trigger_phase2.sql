-- Custom SQL migration file, put your code below! --

-- Trigger server_version (sync) nas tabelas de preços/listas/inventário.
-- Função assign_server_version já existe (migração 0003).

CREATE TRIGGER price_records_server_version
  BEFORE INSERT OR UPDATE ON price_records
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER shopping_lists_server_version
  BEFORE INSERT OR UPDATE ON shopping_lists
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER shopping_list_entries_server_version
  BEFORE INSERT OR UPDATE ON shopping_list_entries
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER inventory_counts_server_version
  BEFORE INSERT OR UPDATE ON inventory_counts
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();
