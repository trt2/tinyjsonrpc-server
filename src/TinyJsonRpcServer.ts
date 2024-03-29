
export enum JSONRPC_ERRORCODES {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
};

export type JsonRpcId = string | number | null;
export type JsonRpcParams = object;
export type RequestContext = any;
export type MethodCallback = (method: string, params?: JsonRpcParams, requestContext?: RequestContext) => any;

export interface MethodMap {
    [key: string]: (params: JsonRpcParams|undefined, requestContext?: RequestContext) => any;
}

export interface ErrorObject {
    code: number;
    message: string;
    data?: any;
};

export interface JsonRpcRequest {
    id?: JsonRpcId;
    jsonrpc: string;
    method: string;
    params?: object;
};

export interface JsonRpcResponse {
    jsonrpc: string;
    result?: any;
    error?: any;
    id: JsonRpcId;
}

function isNumeric(v: any): boolean {
    return !isNaN(Number(v)) && isFinite(v);
}

function isString(v: any): boolean {
    return (typeof v === 'string') || (v instanceof String);
}

/**
 * Create an error object for use with JsonRpcRequestException
 * 
 * @param {*} code 
 * @param {*} message 
 * @param {*} data optional data object/value
 */
export function createErrorObject(code: number, message?: string, data?: any): ErrorObject {
    let error: ErrorObject = {
        code: isNumeric(code) ? code : JSONRPC_ERRORCODES.INTERNAL_ERROR,
        message: message ? message : 'Unspecified error'
    };

    if(data) {
        error.data = data;
    }
    
    return error;
}

/**
 * Exception that is thrown by methods respond with a JSON-RPC error.
 */
export class JsonRpcRequestException extends Error {
    errorObj: ErrorObject;
    name: string;
    message: string;
    stack?: string | undefined;

    constructor(codeOrObject: ErrorObject | number, message?: string, data?: any) {
        super(message);

        if(isNumeric(codeOrObject)) {
            this.errorObj = createErrorObject(codeOrObject as number, message, data);
        } else {
            this.errorObj = codeOrObject as ErrorObject;
        }
        this.name = 'JsonRpcRequestError';
        this.message = 'JsonRpcRequestError: ' + JSON.stringify(this.errorObj);
    }
}

function createErrorResponse(id: JsonRpcId | undefined, code: number, message?: string, data?: any): JsonRpcResponse {
    return { jsonrpc: "2.0", error: createErrorObject(code, message, data), id: id === undefined ? null : id };
}

/**
 * When JSON parsing is done outside the TinyJsonRpcServer, this method can be used
 * to create a parse error response.
 */
export function createParseErrorResponse(message: string = "Unable to parse JSON", data?: any): JsonRpcResponse {
    return createErrorResponse(null, JSONRPC_ERRORCODES.PARSE_ERROR, message, data);
}

function createResultResponse(result: any, id: JsonRpcId): JsonRpcResponse {
    return { jsonrpc: "2.0", result, id };
}

/**
 * Handle JSON-RPC requests and produce response
 * 
 */
export class TinyJsonRpcServer {
    _methods: MethodMap;
    _methodCallback: MethodCallback | undefined;

    constructor() {
        this._methods = {};
        this._methodCallback = undefined;
    }

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
     * 
     * @param {*} methodObj 
     */
    registerMethods(methodObj: MethodMap): void {
        this._methods = { ...this._methods, ...methodObj };
    }

    /**
     * Returns the actual method object used by the server.
     * Values may be added and removed from this object.
     */
    getRegisteredMethods(): MethodMap {
        return this._methods;
    }

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
    registerMethodCallback(methodCallback: MethodCallback): void {
        this._methodCallback = methodCallback;
    }

    /**
     * Returns the registered method callback function
     */
    getMethodCallback(): MethodCallback|undefined {
        return this._methodCallback;
    }

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
    handleJsonRpcRequest(request: JsonRpcRequest | JsonRpcRequest[] | string, requestContext:RequestContext={}): Promise<(JsonRpcResponse|null)[] | JsonRpcResponse | null> {
        return Promise.resolve().then(() => {
            if(isString(request)) {
                try {
                    request = JSON.parse(request as string);
                } catch(e) {
                    return createParseErrorResponse();
                }
            }

            if(Array.isArray(request)) {
                if(request.length === 0) {
                    return createErrorResponse(null, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request, missing request object(s)");
                }

                return this._handleJsonRpcBatchRequest(request, requestContext);
            }


            return this._handleJsonRpcRequest(request as JsonRpcRequest, requestContext);
        }).catch((e) => {
            console.error(e);
            return createErrorResponse(null, JSONRPC_ERRORCODES.INTERNAL_ERROR, "An error occurred when processing request", e);
        });        
    }

    /**
     * Returns a promise
     * 
     * @param {*} request 
     * @param {*} requestContext 
     */
    _handleJsonRpcRequest(request: JsonRpcRequest, requestContext: RequestContext): Promise<JsonRpcResponse|null> {
        // These will be initialized after we call _validateRequest
        let hasRequestId = false;
        let requestId: JsonRpcId|undefined = null;

        return Promise.resolve()
            .then(() => {
                const errorResponse = this._validateRequest(request);
                if(errorResponse) {
                    return errorResponse;
                }

                hasRequestId = 'id' in request;
                requestId = hasRequestId ? request.id as JsonRpcId : null;

                let result;

                const method = this._methods[request.method];
                if(method) {
                    result = method(request.params, requestContext);
                } else {
                    if(typeof this._methodCallback === 'function') {
                        result = this._methodCallback(request.method, request.params, requestContext);
                    }

                    if(result === undefined) {
                        return createErrorResponse(requestId, JSONRPC_ERRORCODES.METHOD_NOT_FOUND, "Method '" + request.method + "' not found");
                    }
                }

                // The method may return a promise, so we "wrap" the result in a new promise
                // in order to resolve it.
                return Promise.resolve(result)
                    .then((result) => {
                        if(hasRequestId) {
                            return createResultResponse(result, requestId as JsonRpcId);
                        }
                        
                        // Return null for notification request
                        return null;
                    });
            })
            .catch((e) => {
                if(e instanceof JsonRpcRequestException) {
                    return createErrorResponse(requestId, e.errorObj.code, e.errorObj.message, e.errorObj.data);
                }
                
                console.error(e);
                // We want to return an error response even for notification requests
                return createErrorResponse(requestId, JSONRPC_ERRORCODES.INTERNAL_ERROR, 'An error occurred when handling request');
            })
            .catch((e) => {
                console.error(e);
                // This is just to make extra sure that _handleJsonRpcRequest will "never" return a rejected promise
                return createErrorResponse(requestId, JSONRPC_ERRORCODES.INTERNAL_ERROR, 'A critical error occurred when handling request');
            });
    }

    /**
     * Returns a promise
     * 
     * @param {*} requests 
     * @param {*} requestContext 
     */
    _handleJsonRpcBatchRequest(requests: JsonRpcRequest[], requestContext: RequestContext={}): Promise<(JsonRpcResponse|null)[] | JsonRpcResponse | null> {
        const promises = requests.map(request => this._handleJsonRpcRequest(request, requestContext));
        return Promise.all(promises)
            .then((responses) => {
                // Remove all null responses
                return responses.filter(response => response !== null);
            })
            .then((responses) => {
                // If array is empty, return null
                if(responses.length === 0) {
                    return null;
                }
                
                return responses;
            })
            .catch((e) => {
                console.error(e);
                // This shouldn't occur
                return createErrorResponse(null, JSONRPC_ERRORCODES.INTERNAL_ERROR, 'An error occurred when handling request');
            });
    }

    /**
     * Returns an error response object on error, null on success.
     * 
     * @param {*} request 
     */
    _validateRequest(request: JsonRpcRequest) : JsonRpcResponse | null {
        let requestId = null;

        if(request !== Object(request)) {
            return createErrorResponse(requestId, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request");
        }

        // We don't check version
        if(!request.jsonrpc) {
            return createErrorResponse(requestId, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request, missing jsonrpc version");
        }

        if('id' in request) {
            // Numbers and non-empty strings are valid ids
            if(isNumeric(request.id) || isString(request.id) || request.id === null) {
                requestId = request.id;
            } else {
                return createErrorResponse(requestId, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request, invalid id");
            }
        }

        if(!isString(request.method) || request.method === '') {
            return createErrorResponse(requestId, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request, missing method");
        }

        if(request.params) {
            if(!(Array.isArray(request.params) || (typeof request.params === 'function') || (typeof request.params === 'object'))) {
                return createErrorResponse(requestId, JSONRPC_ERRORCODES.INVALID_REQUEST, "Invalid request, invalid parameter type");
            }
        }

        return null;
    }
}