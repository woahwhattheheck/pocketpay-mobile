// Validation-only entry; set package.json main to this file in the native lab.
// Production shim must execute before the SDK-dependent bootstrap is required.
require('./shim');
require('./native321-bootstrap');
require('expo-router/entry');
