from dataclasses import dataclass


@dataclass
class CurrentUser:
    token: str
    user_id: str
    username: str
    role: str


ANONYMOUS_USER = CurrentUser(token="", user_id="anonymous", username="匿名用户", role="user")
