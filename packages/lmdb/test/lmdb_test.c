#include <lmdb.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  const char* dir = getenv("TEST_TMPDIR");
  MDB_env* env;
  MDB_txn* txn;
  MDB_dbi dbi;
  MDB_val key = {6, "answer"}, value = {2, "42"}, found;
  if (!dir || mdb_env_create(&env) || mdb_env_open(env, dir, 0, 0664)) return 1;
  if (mdb_txn_begin(env, NULL, 0, &txn) || mdb_dbi_open(txn, NULL, 0, &dbi)) return 2;
  if (mdb_put(txn, dbi, &key, &value, 0) || mdb_txn_commit(txn)) return 3;
  if (mdb_txn_begin(env, NULL, MDB_RDONLY, &txn) || mdb_get(txn, dbi, &key, &found)) return 4;
  int ok = found.mv_size == 2 && memcmp(found.mv_data, "42", 2) == 0;
  mdb_txn_abort(txn);
  mdb_env_close(env);
  return ok ? 0 : 5;
}
