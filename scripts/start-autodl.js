process.env.PORT ||= "6008";
process.env.HOST ||= "0.0.0.0";
await import("../src/server.js");
