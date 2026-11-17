from ...services.auth_service import ANONYMOUS_USER, CurrentUser


async def get_current_user() -> CurrentUser:
    return ANONYMOUS_USER
