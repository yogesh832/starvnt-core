/** Native clients persist rotating refresh credentials in the OS keychain.
 * Browser clients retain the existing HttpOnly-cookie contract. This header is
 * transport negotiation, never authentication or an authorization bypass.
 */
export function nativeAuthTransport(cookieName) {
  return (req, res, next) => {
    if (req.get("X-Starvnt-Client") !== "native") return next();
    if (["/refresh", "/logout"].includes(req.path)) {
      // Never fall back to another client's cookie when a native credential is absent.
      req.cookies = {
        ...req.cookies,
        [cookieName]:
          typeof req.body?.refreshToken === "string"
            ? req.body.refreshToken
            : undefined,
      };
    }
    let refreshToken;
    const cookie = res.cookie.bind(res);
    res.cookie = (name, value, options) => {
      if (name === cookieName) refreshToken = value;
      return cookie(name, value, options);
    };
    const json = res.json.bind(res);
    res.json = (body) =>
      json(
        refreshToken && body?.accessToken ? { ...body, refreshToken } : body,
      );
    next();
  };
}
