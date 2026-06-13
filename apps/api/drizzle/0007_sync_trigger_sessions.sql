-- Custom SQL migration file, put your code below! --

-- Trigger server_version (sync) nas tabelas de sessão de compra.

CREATE TRIGGER shopping_sessions_server_version
  BEFORE INSERT OR UPDATE ON shopping_sessions
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();

CREATE TRIGGER shopping_session_items_server_version
  BEFORE INSERT OR UPDATE ON shopping_session_items
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();
