const { assert, expect } = require('chai');

const { 
    JSONRPC_ERRORCODES,
    createParseErrorResponse,
    JsonRpcRequestException,
    TinyJsonRpcServer 
} = require('../lib/TinyJsonRpcServer'); 

function serviceRegistrator({namespace=''} = {}) {
    let methods = {};

    const getMethodName = (funcName) => {
        return namespace !== '' ? namespace + '.' + funcName : funcName;
    };

    const addMethod = (funcName, func) => {
        methods[getMethodName(funcName)] = func;
    };

    const retObj = {
        add(funcName, func) {
            addMethod(funcName, func);
            return retObj;
        },
        get() {
            return methods;
        }
    };

    return retObj;
}

function throwParamError(message, data) {
    throw new JsonRpcRequestException(JSONRPC_ERRORCODES.INVALID_PARAMS, message, data);
}

class JsonRpcTestServices {
    constructor() {
        this._callCount = {};
    }

    resetCallCount() {
        this._callCount = {};
    }

    getCallCount(funcName) {
        return this._callCount[funcName];
    }

    _incCallCount(funcName) {
        this._callCount[funcName] = (this._callCount[funcName] || 0) + 1;
    }

    getHelloString(params, requestContext) {
        this._incCallCount('getHelloString');
        return 'Hello World!';
    }

    addNumbers(params, requestContext) {
        this._incCallCount('addNumbers');
        isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
        isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
        return params.a + params.b;
    }

    getRequestContextValue(params, requestContext) {
        this._incCallCount('getRequestContextValue');
        if(!params.key) {
            throwParamError("Invalid parameter 'key'");
        }
        
        return requestContext[params.key];
    }

    multiplyNumbers(params, requestContext) {
        this._incCallCount('multiplyNumbers');
        isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
        isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
        return params.a * params.b;
    }

    joinStrings(params, requestContext) {
        this._incCallCount('joinStrings');
        typeof params.a !== 'string' && throwParamError("Invalid parameter 'a', not a string");
        typeof params.b !== 'string' && throwParamError("Invalid parameter 'b', not a string");
        return params.a + params.b;
    }

    asyncAddNumbers(params, requestContext) {
        this._incCallCount('asyncAddNumbers');
        return new Promise((resolve, reject) => {
            isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
            isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
                
            setTimeout(() => { resolve(params.a + params.b); }, 1000);
        });
    }

    alwaysException() {
        this._incCallCount('alwaysException');
        throw new Error('Forced exception');
    }

    getServiceMethods() {
        return serviceRegistrator({namespace: 'my.namespace'})
            .add('getHelloString', this.getHelloString.bind(this))
            .add('addNumbers', this.addNumbers.bind(this))
            .add('multiplyNumbers', this.multiplyNumbers.bind(this))
            .add('joinStrings', this.joinStrings.bind(this))
            .add('asyncAddNumbers', this.asyncAddNumbers.bind(this))
            .add('alwaysException', this.alwaysException.bind(this))
            .add('getRequestContextValue', this.getRequestContextValue.bind(this))
            .get();
    }
}

const testServices = new JsonRpcTestServices();

const jsonRpcServer = new TinyJsonRpcServer();

jsonRpcServer.registerMethods(testServices.getServiceMethods());

const NO_REQUEST_ID = {dummy: ''};

function createJsonRpcRequest(method, params, id) {
    let ret = { jsonrpc: '2.0', method };
    if(params != undefined) {
        ret.params = params;
    }

    if(id !== NO_REQUEST_ID) {
        ret.id = id;
    }

    return ret;
}

function getResponseById(id, batchResponse) {
    for(let i=0;i<batchResponse.length;i++) {
        if(id === batchResponse[i].id) {
            return batchResponse[i];
        }
    }

    return null;
}

describe("TinyJsonRpcServer", function() {
    beforeEach(function() {
        testServices.resetCallCount();
    });

    it('call method without parameters getHelloString', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.getHelloString', undefined, 1))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 'Hello World!', id: 1});
                expect(testServices.getCallCount('getHelloString')).to.eq(1);
            });
    });

    it('call method with parameters addNumbers', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, 2))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 12, id: 2});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });

    it('call method with requestContext', function() {
        const requestContext = {
            val1: 'some value'
        };

        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.getRequestContextValue', {key: 'val1'}, 3), requestContext)
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 'some value', id: 3});
                expect(testServices.getCallCount('getRequestContextValue')).to.eq(1);
            });
    });    
    
    it('call method with parameters addNumbers with id=0', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, 0))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 12, id: 0});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });

    it('call method with parameters addNumbers with id=""', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, ""))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 12, id: ""});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });

    it('call method with parameters addNumbers with id=undefined', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, undefined))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request, invalid id"}, id: null});
                expect(testServices.getCallCount('addNumbers')).to.be.undefined;
            });
    });    

    it('call method with parameters addNumbers with id=null', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, null))
            .then((response) => {
                expect(response).to.eql({jsonrpc: '2.0', result: 12, id: null});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });    

    it('call method notification', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, NO_REQUEST_ID))
            .then((response) => {
                expect(response).to.be.null;
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });

    it('call method returning promise with parameters asyncAddNumbers', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.asyncAddNumbers', {a: 4, b: 8}, 2))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 12, id: 2});
                expect(testServices.getCallCount('asyncAddNumbers')).to.eq(1);
            });
    });

    it('call method that throws a non-JsonRpcRequestException exception', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.alwaysException', undefined, 2))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INTERNAL_ERROR, message: "An error occurred when handling request"}, id: 2});
                expect(testServices.getCallCount('alwaysException')).to.eq(1);
            });
    });

    it('call method returning promise with invalid parameters asyncAddNumbers', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.asyncAddNumbers', {a: 'a', b: 8}, 2))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 2});
                expect(testServices.getCallCount('asyncAddNumbers')).to.eq(1);
            });
    });

    it('call method with invalid parameters addNumbers', function() {
        return jsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 'a', b: 8}, 3))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 3});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });    

    it('invalid json', function() {
        return jsonRpcServer.handleJsonRpcRequest('{ "jsonrpc": "2.0", method: "my.namespace.addNumbers, params: { "a": 4, "b": 8 }, id: 4 }')
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response.error.code).to.eq(JSONRPC_ERRORCODES.PARSE_ERROR);
            });
    });

    it('missing jsonrpc version on single request', function() {
        let request = createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, 'nojsonrpc');
        delete request.jsonrpc;

        return jsonRpcServer.handleJsonRpcRequest(request)
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request, missing jsonrpc version"}, id: null});
            });
    });    

    it('batch call', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', result: 12, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });

    it('batch call method with requestContext', function() {
        const requestContext = {
            val1: 'some value',
            val2: true,
            val3: 777,
        };

        return jsonRpcServer.handleJsonRpcRequest([
                createJsonRpcRequest('my.namespace.getRequestContextValue', {key: 'val1'}, 4),
                createJsonRpcRequest('my.namespace.getRequestContextValue', {key: 'val2'}, 5),
                createJsonRpcRequest('my.namespace.getRequestContextValue', {key: 'val3'}, 6),
            ], requestContext)
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(3);
                expect(getResponseById(4, response)).to.eql({jsonrpc: '2.0', result: 'some value', id: 4});
                expect(getResponseById(5, response)).to.eql({jsonrpc: '2.0', result: true, id: 5});
                expect(getResponseById(6, response)).to.eql({jsonrpc: '2.0', result: 777, id: 6});
                expect(testServices.getCallCount('getRequestContextValue')).to.eq(3);
            });
    });  

    it('batch call, with 1 async', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.asyncAddNumbers', {a: 4, b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', result: 12, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('asyncAddNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });    

    it('batch call, with all async', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.asyncAddNumbers', {a: 4, b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.asyncAddNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', result: 12, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 13, id: 'call2'});
                expect(testServices.getCallCount('asyncAddNumbers')).to.eq(2);
            });
    });    

    it('batch call, with 1 notification', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, NO_REQUEST_ID),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(1);
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });    

    it('batch call, with all notifications', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 8}, NO_REQUEST_ID),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, NO_REQUEST_ID)
                ]
            )
            .then((response) => {
                expect(response).to.be.null;
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });    

    it('batch call, one fail', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 'a', b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });

    it('batch call, all fail', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 'a', b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 'a', b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 'call2'});
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });

    it('batch call, one missing method', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbersDoesNotExist', {a: 4, b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.METHOD_NOT_FOUND, message: "Method 'my.namespace.addNumbersDoesNotExist' not found"}, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });       

    it('missing jsonrpc version on batch request', function() {
        let request = [
            createJsonRpcRequest('my.namespace.addNumbersDoesNotExist', {a: 4, b: 8}, 'call1'),
            createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
        ];

        delete request[0].jsonrpc;

        return jsonRpcServer.handleJsonRpcRequest(request)
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById(null, response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request, missing jsonrpc version"}, id: null});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
                expect(testServices.getCallCount('multiplyNumbers')).to.eq(1);
            });
    });

    it('empty batch request', function() {
        let request = [];
        return jsonRpcServer.handleJsonRpcRequest(request)
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request, missing request object(s)"}, id: null});
            });
    });

    it('1 invalid batch request entries', function() {
        let request = [1];
        return jsonRpcServer.handleJsonRpcRequest(request)
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(1);
                response.forEach(item => {
                    expect(item).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request"}, id: null});
                });
            });
    });

    it('3 invalid batch request entries', function() {
        let request = [1,2,3];
        return jsonRpcServer.handleJsonRpcRequest(request)
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(3);
                response.forEach(item => {
                    expect(item).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_REQUEST, message: "Invalid request"}, id: null});
                });
            });
    });       
    
    it('batch call methods that throws a non-JsonRpcRequestException exception', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.alwaysException', undefined, 2),
                    createJsonRpcRequest('my.namespace.alwaysException', undefined, 3)
                ])
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById(2, response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INTERNAL_ERROR, message: "An error occurred when handling request"}, id: 2});
                expect(getResponseById(3, response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INTERNAL_ERROR, message: "An error occurred when handling request"}, id: 3});
                expect(testServices.getCallCount('alwaysException')).to.eq(2);
            });
    });

    it('batch call with 1 notification method that throws a non-JsonRpcRequestException exception', function() {
        return jsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.alwaysException', undefined, NO_REQUEST_ID),
                    createJsonRpcRequest('my.namespace.addNumbers', {a: 6, b: 8}, 'call2')
                ])
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById(null, response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INTERNAL_ERROR, message: "An error occurred when handling request"}, id: null});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 14, id: 'call2'});
                expect(testServices.getCallCount('alwaysException')).to.eq(1);
                expect(testServices.getCallCount('addNumbers')).to.eq(1);
            });
    });

    it('methodCallback, call method without parameters', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.getHelloString', undefined, 1))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 'Hello callback World!', id: 1});
            });
    });

    it('methodCallback, call non-existing method', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.getHelloString2', undefined, 1))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.METHOD_NOT_FOUND, message: "Method 'my.namespace.getHelloString2' not found"}, id: 1});
            });
    });

    it('methodCallback, call method with parameters addNumbers', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
                case 'my.namespace.addNumbers': {
                    isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
                    isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
                    return params.a + params.b;
                }
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 10}, 1))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 14, id: 1});
            });
    });
    
    it('methodCallback, call method with parameters addNumbers with promise return', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
                case 'my.namespace.addNumbers': {
                    isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
                    isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
                    return Promise.resolve(params.a + params.b);
                }
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 4, b: 10}, 1))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', result: 14, id: 1});
            });
    });
    
    it('methodCallback, call method with invalid parameters addNumbers', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
                case 'my.namespace.addNumbers': {
                    isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
                    isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
                    return params.a + params.b;
                }
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(createJsonRpcRequest('my.namespace.addNumbers', {a: 'a', b: 10}, 3))
            .then((response) => {
                expect(response).to.be.an('object');
                expect(response).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.INVALID_PARAMS, message: "Invalid parameter 'a', not a number"}, id: 3});
            });
    });

    it('methodCallback, batch call', function() {
        const tmpJsonRpcServer = new TinyJsonRpcServer();
        
        tmpJsonRpcServer.registerMethodCallback((method, params, requestContext) => {
            switch(method) {
                case 'my.namespace.getHelloString': return 'Hello callback World!';
                case 'my.namespace.multiplyNumbers': {
                    isNaN(Number(params.a)) && throwParamError("Invalid parameter 'a', not a number");
                    isNaN(Number(params.b)) && throwParamError("Invalid parameter 'b', not a number");
                    return Promise.resolve(params.a * params.b);
                }
            }
        });

        return tmpJsonRpcServer.handleJsonRpcRequest(
                [
                    createJsonRpcRequest('my.namespace.addNumbersDoesNotExist', {a: 4, b: 8}, 'call1'),
                    createJsonRpcRequest('my.namespace.multiplyNumbers', {a: 3, b: 10}, 'call2')
                ]
            )
            .then((response) => {
                expect(response).to.be.an('array');
                expect(response.length).to.eq(2);
                expect(getResponseById('call1', response)).to.eql({jsonrpc: '2.0', error: {code: JSONRPC_ERRORCODES.METHOD_NOT_FOUND, message: "Method 'my.namespace.addNumbersDoesNotExist' not found"}, id: 'call1'});
                expect(getResponseById('call2', response)).to.eql({jsonrpc: '2.0', result: 30, id: 'call2'});
            });
    });    
});