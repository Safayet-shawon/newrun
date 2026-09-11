import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("nexora.email")


def configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def send_email(to_email: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send transactional email through deployment-provided SMTP credentials.

    No credentials or provider assumptions are hard-coded. In development,
    callers can safely continue when SMTP is not configured; production should
    set REQUIRE_EMAIL_VERIFICATION=true and configure SMTP.
    """
    if not configured():
        logger.warning("SMTP not configured; email '%s' to %s was not sent", subject, to_email)
        return False

    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME")
    password = os.getenv("SMTP_PASSWORD")
    use_tls = os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes", "on"}
    use_ssl = os.getenv("SMTP_USE_SSL", "false").lower() in {"1", "true", "yes", "on"}

    message = EmailMessage()
    message["From"] = os.environ["SMTP_FROM"]
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(text)
    if html:
        message.add_alternative(html, subtype="html")

    smtp_cls = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_cls(host, port, timeout=20) as client:
        if not use_ssl and use_tls:
            client.starttls()
        if username:
            client.login(username, password or "")
        client.send_message(message)
    return True
