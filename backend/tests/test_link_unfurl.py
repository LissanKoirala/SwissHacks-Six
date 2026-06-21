"""Link preview / unfurl helper."""

from workbench.link_unfurl import LinkPreview, unfurl_link


def test_unfurl_rejects_non_http():
    try:
        unfurl_link("ftp://example.com/x")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_unfurl_blocked_host_returns_favicon(monkeypatch):
    monkeypatch.setattr(
        "workbench.link_unfurl._host_blocked",
        lambda _host: True,
    )
    preview = unfurl_link("https://example.com/article")
    assert preview.preview_kind == "favicon"
    assert preview.favicon_url
    assert preview.image_url is None


def test_preview_model_roundtrip():
    model = LinkPreview(
        url="https://example.com",
        image_url="https://example.com/og.png",
        favicon_url="https://example.com/favicon.ico",
        preview_kind="thumbnail",
    )
    restored = LinkPreview.model_validate(model.model_dump())
    assert restored.image_url.endswith("og.png")
