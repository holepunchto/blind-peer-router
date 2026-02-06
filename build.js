const path = require("path");
const HyperDB = require("hyperdb/builder");
const Hyperschema = require("hyperschema");

const SCHEMA_DIR = path.join(__dirname, "spec", "hyperschema");
const DB_DIR = path.join(__dirname, "spec", "hyperdb");

function build() {
  const schema = Hyperschema.from(SCHEMA_DIR, { versioned: false });
  const ns = schema.namespace("blind-peer-router");

  ns.register({
    name: "assignment",
    fields: [
      {
        name: "key",
        type: "fixed32",
        required: true,
      },
      {
        name: "peers",
        type: "fixed32",
        required: true,
        array: true,
      },
    ],
  });

  ns.register({
    name: "get-peers-request",
    fields: [
      {
        name: "key",
        type: "fixed32",
        required: true,
      },
    ],
  });

  ns.register({
    name: "get-peers-response",
    fields: [
      {
        name: "peers",
        type: "fixed32",
        required: true,
        array: true,
      },
    ],
  });

  Hyperschema.toDisk(schema);

  const db = HyperDB.from(SCHEMA_DIR, DB_DIR);
  const routingDb = db.namespace("blind-peer-router");

  routingDb.collections.register({
    name: "assignment",
    schema: "@blind-peer-router/assignment",
    key: ["key"],
  });

  HyperDB.toDisk(db);
}

build();
