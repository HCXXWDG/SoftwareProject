package com.example.commutemood.external;

/** Sanitized failure: never propagate an upstream URI containing the API key. */
public class RouteProviderException extends RuntimeException {
    public RouteProviderException() {
        super("步行路线服务暂不可用，请稍后重试。");
    }
}
