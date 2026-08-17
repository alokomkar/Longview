import asyncio
from typing import Protocol


class AuthenticationError(Exception):
    """The caller did not provide a valid Firebase identity."""


class TokenVerifier(Protocol):
    async def verify(self, token: str) -> str: ...


class FirebaseTokenVerifier:
    async def verify(self, token: str) -> str:
        return await asyncio.to_thread(self._verify, token)

    @staticmethod
    def _verify(token: str) -> str:
        try:
            import firebase_admin
            from firebase_admin import auth

            try:
                firebase_admin.get_app()
            except ValueError:
                firebase_admin.initialize_app()
            decoded = auth.verify_id_token(token, check_revoked=True)
            uid = decoded.get("uid")
            if not isinstance(uid, str) or not uid:
                raise AuthenticationError("token has no user identity")
            return uid
        except AuthenticationError:
            raise
        except Exception as error:
            raise AuthenticationError("invalid Firebase ID token") from error


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthenticationError("missing authorization")
    scheme, separator, token = authorization.partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        raise AuthenticationError("invalid authorization")
    return token.strip()
