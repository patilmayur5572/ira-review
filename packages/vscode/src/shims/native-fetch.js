// Shim: redirect node-fetch imports to Node 18+ native fetch
// Eliminates node-fetch + tr46 (286KB unicode mapping table) from bundle
module.exports = globalThis.fetch;
module.exports.default = globalThis.fetch;
module.exports.Headers = globalThis.Headers;
module.exports.Request = globalThis.Request;
module.exports.Response = globalThis.Response;
