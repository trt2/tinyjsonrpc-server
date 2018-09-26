# Tiny JSON-RPC Server

A fairly simple nodejs JSON-RPC server library without any specific server dependencies.

## Usage

The library may be used to create a handler for JSON-RPC calls.

Basic handling of JSON-RPC calls:
```
const { 
    JSONRPC_ERRORCODES,
    createParseErrorResponse,
    JsonRpcRequestException,
    TinyJsonRpcServer 
} = require('@trt2/tinyjsonrpc-server');

const jsonRpcServer = new TinyJsonRpcServer();
jsonRpcServer.registerMethods({
    'add': function(params, requestContext) {
        return params.a + params.b;
    }
});

// The requestContext contains data that should be accessible
// to the registered functions. This is a convenient place to put
// either http information directly or authentication data etc.

let requestContext = {
    valueForRegisteredMethod: 'some text',
    httpRequest: {},    // could be used to get cookies etc
    httpResponse: {}    // could be used to set cookies etc
}

const jsonRpcResponse = jsonRpcServer.handleJsonRpcRequest({ 
        jsonrpc: '2.0', 
        method: 'add',
        params: { a: 2, b: 4 },
        id: 1
    }, requestContext);

// jsonRpcResponse:
// { jsonrpc: '2.0', result: 6, id: 1 }
```

## Expressjs Example
```
const express = require('express');
const { 
    JSONRPC_ERRORCODES,
    JsonRpcRequestException,
    TinyJsonRpcServer 
} = require('@trt2/tinyjsonrpc-server'); 

const jsonRpcServer = new TinyJsonRpcServer();

function throwParamError(message, data) {
    throw new JsonRpcRequestException(JSONRPC_ERRORCODES.INVALID_PARAMS, message, data);
}

function jsonRpcAddMethod(params, requestContext) {
    isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
    isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");

    return params.a + params.b;
}

jsonRpcServer.registerMethods({
    'my.namespace.add': jsonRpcAddMethod
});

function handleJsonRpcRequest(req, res) {
    const requestContext = {req, res};
    jsonRpcServer.handleJsonRpcRequest(req.body, requestContext)
        .then((response) => { 
            res.json(response);
            return response;
        })
        .catch((e) => {
            // This should never occur, handleJsonRpcRequest should take care of all errors
            // and produce a response.
            res.status(500).send({ error: 'Error occurred when processing request' });
        });
}


const app = express();
app.use(express.json());

app.post('/api/jsonrpc', handleJsonRpcRequest);

app.listen(3000, () => console.log('Example app listening on port 3000!'));

```


## class TinyJsonRpcServer
The TinyJsonRpcServer class has the following methods:

### registerMethods(methodObj)
```
/**
 * Register methods with this server.
 * This method accepts an object where the key is the public method name
 * and the value is a function.
 * 
 * The registered method will be given the following parameters:
 * function (params, requestContext) {
 *     return <result or Promise>;
 * }
 * 
 * If the method registered is the method of a javascript class, remember
 * to bind it to the correct "this":
 *   { "mymethod": this.mymethod.bind(this) }
 */
```

### getRegisteredMethods()
```
/**
 * Returns the actual method object used by the server.
 * Values may be added and removed from this object.
 */
```

### registerMethodCallback(methodCallback)
```
/**
 * Register a callback that will be called if there is no method
 * registered for the method in the json-rpc request.
 * 
 * The callback will be given the following parameters:
 * 
 * function (method, params, requestContext) {
 *     return <result, undefined or Promise>;
 * }
 * 
 * When undefined is returned, the response will be treated 
 * as if the method was not found.
 * 
 * The callback may be used in addition to or instead of the
 * registerMethods. The registered method will take precendece.
 * 
 * @param {*} methodCallback 
 */
```

### getMethodCallback()
```
/**
 * Returns the registered method callback function
 */
```

### handleJsonRpcRequest(request, requestContext={})
```
/**
 * Handle a JSON-RPC request and produce a response object/list.
 * This method returns a promise that should always be resolved, meaning
 * this will always produce a "final" JSON-RPC response that can be passed
 * back to the caller.
 * 
 * When the request produces no results (only notification requests), null 
 * is returned.
 * 
 * @param {*} request either string or JSON object
 * @param {*} requestContext optional context object passed to the handler methods
 */
```

## function createErrorObject(code, message, data)
```
/**
 * Create an error object for use with JsonRpcRequestException
 * 
 * @param {*} code 
 * @param {*} message 
 * @param {*} data optional data object/value
 */
 ```