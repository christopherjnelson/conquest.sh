"""Announce an existing GitHub release through a Discord webhook."""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request


def main() -> None:
    tag = os.environ.get("RELEASE_TAG", "").strip()
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    github_token = os.environ.get("GITHUB_TOKEN", "")
    webhook_url = os.environ.get("DISCORD_RELEASE_WEBHOOK_URL", "").strip()

    if not re.fullmatch(r"v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", tag):
        raise SystemExit("A valid release tag is required")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise SystemExit("A GitHub repository is required")
    if not github_token:
        raise SystemExit("The GitHub token is missing")

    webhook = urllib.parse.urlsplit(webhook_url)
    if (
        webhook.scheme != "https"
        or webhook.netloc != "discord.com"
        or not re.fullmatch(r"/api(?:/v[0-9]+)?/webhooks/[0-9]+/[^/]+", webhook.path)
    ):
        raise SystemExit("A Discord webhook URL is required")

    release_api_url = (
        f"https://api.github.com/repos/{repository}/releases/tags/"
        f"{urllib.parse.quote(tag, safe='')}"
    )
    release_request = urllib.request.Request(
        release_api_url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {github_token}",
            "User-Agent": "conquest-release-announcer",
        },
    )
    try:
        with urllib.request.urlopen(release_request, timeout=20) as response:
            release = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"GitHub release lookup failed (HTTP {error.code})") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise SystemExit("GitHub release lookup failed") from None

    release_url = release.get("html_url", "")
    expected_url = f"https://github.com/{repository}/releases/tag/{tag}"
    if release.get("draft") or not release.get("published_at") or release_url != expected_url:
        raise SystemExit("The requested release is not published")

    name = " ".join((release.get("name") or tag).split())[:120]
    kind = "pre-release" if release.get("prerelease") else "release"
    payload = {
        "username": "conquest.sh releases",
        "content": f"🚀 **{name}** {kind} is live!",
        "embeds": [{
            "title": "Release notes and downloads",
            "url": release_url,
            "description": "See what's new and get the latest builds on GitHub.",
            "color": 0x00D2FF,
        }],
        "allowed_mentions": {"parse": []},
    }
    query = [(key, value) for key, value in urllib.parse.parse_qsl(webhook.query) if key != "wait"]
    query.append(("wait", "true"))
    confirmation_url = urllib.parse.urlunsplit(
        webhook._replace(query=urllib.parse.urlencode(query))
    )
    request = urllib.request.Request(
        confirmation_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            message = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"Discord rejected the announcement (HTTP {error.code})") from None
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise SystemExit("Discord did not confirm the announcement") from None

    if not message.get("id"):
        raise SystemExit("Discord did not return a message ID")
    print(f"Announced {tag} to Discord (message ID {message['id']})")


if __name__ == "__main__":
    main()
