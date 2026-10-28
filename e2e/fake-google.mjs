// 가짜 구글 - 로그인 E2E(e2e/server-flow.spec.ts)에서만 쓴다.
//
// 진짜 구글은 자동으로 움직이는 브라우저의 로그인을 막는다. 그래서 OpenID Connect 의 네 주소만
// 진짜처럼 내준다. 백엔드는 발급자 주소(issuer-uri) 하나만 이쪽으로 바꾸면 발견 문서를 읽어
// 나머지 주소를 스스로 채운다 - 진짜 구글을 쓸 때와 같은 길이다(janggi-events 의 LoginFlowTest 와 같다).
//
//   GET  /.well-known/openid-configuration  발견 문서
//   GET  /authorize                         화면 없이 바로 허락하고 code 를 들려 돌려보낸다
//   POST /token                             code 를 id_token 으로 바꿔 준다(RS256 서명, nonce 포함)
//   GET  /jwks                              서명을 확인할 공개 열쇠
//   POST /e2e/next-user?sub=…               다음 로그인을 누구로 할지. 시험이 정한다
//
// 쓰는 법: node e2e/fake-google.mjs [포트, 기본 9400]
// 받는 쪽(백엔드)의 client_id 는 확인하지 않는다. 시험용이다.

import { createServer } from "node:http";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";

const PORT = Number(process.argv[2] ?? 9400);
const ISSUER = `http://localhost:${PORT}`;
const KID = "e2e-key-1";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

/** 다음에 로그인할 사람. /e2e/next-user 로 바꾼다. */
let nextSub = "e2e-user";
/** 내준 code → 그 로그인의 정보. 한 번 쓰면 지운다. */
const codes = new Map();

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function idToken({ sub, nonce, aud }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: KID, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: ISSUER, sub, aud, azp: aud, iat: now, exp: now + 600, nonce }));
  const signature = sign("sha256", Buffer.from(`${header}.${body}`), privateKey);
  return `${header}.${body}.${b64url(signature)}`;
}

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

/** client_id 는 Basic 인증 머리글이나 본문에 온다. 스프링은 Basic 으로 보낸다. */
function clientIdOf(req, form) {
  const auth = req.headers.authorization ?? "";
  if (auth.startsWith("Basic ")) {
    const pair = Buffer.from(auth.slice(6), "base64").toString("utf8");
    return decodeURIComponent(pair.split(":")[0]);
  }
  return form.get("client_id") ?? "";
}

createServer(async (req, res) => {
  /*
   * 연결을 다시 쓰지 않는다. Node 의 http 서버는 쉬는 연결을 6초(keepAliveTimeout 5초 +
   * keepAliveTimeoutBuffer 1초) 뒤에 닫는데, 시험이 같은 요청 문맥으로 마침 그때 다시 보내면
   * 닫히는 연결에 실려 read ECONNRESET 으로 끝났다. 두 요청 사이를 5990~6010ms 로 두고 90번
   * 보내니 18번 났다(5900·5960·6100 은 0번). 시험용 서버라 요청마다 새 연결을 열어도 잃는 것이 없다.
   */
  res.setHeader("Connection", "close");
  const url = new URL(req.url, ISSUER);
  try {
    if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
      return json(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        grant_types_supported: ["authorization_code"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    if (req.method === "GET" && url.pathname === "/jwks") {
      return json(res, 200, { keys: [jwk] });
    }
    if (req.method === "GET" && url.pathname === "/authorize") {
      const redirect = url.searchParams.get("redirect_uri");
      if (!redirect) return json(res, 400, { error: "redirect_uri 가 없다" });
      const code = b64url(randomBytes(16));
      codes.set(code, {
        sub: nextSub,
        nonce: url.searchParams.get("nonce"),
        aud: url.searchParams.get("client_id"),
      });
      const back = new URL(redirect);
      back.searchParams.set("code", code);
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/token") {
      const form = new URLSearchParams(await readBody(req));
      const grant = codes.get(form.get("code"));
      if (!grant) return json(res, 400, { error: "invalid_grant" });
      codes.delete(form.get("code"));
      const aud = clientIdOf(req, form) || grant.aud;
      return json(res, 200, {
        access_token: b64url(randomBytes(16)),
        token_type: "Bearer",
        expires_in: 600,
        scope: "openid",
        id_token: idToken({ sub: grant.sub, nonce: grant.nonce, aud }),
      });
    }
    if (req.method === "POST" && url.pathname === "/e2e/next-user") {
      const sub = url.searchParams.get("sub");
      if (!sub) return json(res, 400, { error: "sub 가 없다" });
      nextSub = sub;
      return json(res, 200, { next: nextSub });
    }
    json(res, 404, { error: "없는 주소" });
  } catch (err) {
    json(res, 500, { error: String(err) });
  }
}).listen(PORT, () => console.log(`가짜 구글: ${ISSUER}`));
