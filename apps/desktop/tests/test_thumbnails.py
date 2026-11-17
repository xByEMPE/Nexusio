"""Caché de miniaturas: en disco se recorta a un tope (lo menos usado primero) y en memoria es LRU."""
from __future__ import annotations

import os
import time

from PIL import Image

from nexus_desktop.ui import thumbnails


def fill(cache, names_sizes, start=1_000_000):
    """Archivos de caché con fechas de uso crecientes (el primero, el más antiguo)."""
    cache.mkdir(parents=True, exist_ok=True)
    for i, (name, size) in enumerate(names_sizes):
        p = cache / name
        p.write_bytes(b"x" * size)
        os.utime(p, (start + i * 10, start + i * 10))


def test_prune_removes_least_recently_used_until_under_cap(tmp_path):
    cache = tmp_path / "thumbs"
    fill(cache, [("a.jpg", 400), ("b.jpg", 400), ("c.jpg", 400), ("d.jpg", 400)])
    removed = thumbnails.prune_cache(cache, max_bytes=900)
    assert removed == 2
    assert sorted(p.name for p in cache.iterdir()) == ["c.jpg", "d.jpg"]


def test_prune_under_cap_and_missing_dir_do_nothing(tmp_path):
    cache = tmp_path / "thumbs"
    assert thumbnails.prune_cache(cache, max_bytes=10) == 0  # no existe: sin error
    fill(cache, [("a.jpg", 100)])
    assert thumbnails.prune_cache(cache, max_bytes=1000) == 0 and (cache / "a.jpg").exists()


def test_prune_keeps_recent_temporaries_and_drops_old_ones(tmp_path):
    cache = tmp_path / "thumbs"
    fill(cache, [(".viejo.tmp", 10)])
    (cache / ".nuevo.tmp").write_bytes(b"x" * 10)  # otro hilo lo está escribiendo ahora
    thumbnails.prune_cache(cache, max_bytes=10**9)
    assert [p.name for p in cache.iterdir()] == [".nuevo.tmp"]


def test_default_cap_is_500_mb():
    assert thumbnails.CACHE_MAX_BYTES == 500 * 1024 * 1024


def test_cache_hit_counts_as_recent_use(tmp_path):
    photo = tmp_path / "foto.jpg"
    Image.new("RGB", (600, 400), (10, 20, 30)).save(photo, "JPEG")
    cache = tmp_path / "thumbs"
    thumbnails.load_display(photo, cache, max_side=100)
    (cached,) = list(cache.glob("*.jpg"))
    os.utime(cached, (1_000_000, 1_000_000))  # como si hiciera mucho que no se usa
    fill(cache, [("otra.jpg", 10)], start=2_000_000)
    thumbnails.load_display(photo, cache, max_side=100)  # acierto de caché: se "toca"
    assert cached.stat().st_mtime > time.time() - 60
    thumbnails.prune_cache(cache, max_bytes=cached.stat().st_size)
    assert cached.exists() and not (cache / "otra.jpg").exists()


def test_first_use_prunes_once_per_cache_dir(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(thumbnails, "prune_cache", lambda cache, max_bytes=0: calls.append(cache) or 0)
    monkeypatch.setattr(thumbnails, "_pruned", set())
    photo = tmp_path / "foto.jpg"
    Image.new("RGB", (60, 40)).save(photo, "JPEG")
    cache = tmp_path / "thumbs"
    thumbnails.load_display(photo, cache, max_side=50)
    thumbnails.load_display(photo, cache, max_side=50)
    assert calls == [cache]


def test_lru_cache_evicts_least_recently_used():
    lru = thumbnails.LruCache(2)
    lru["a"], lru["b"] = 1, 2
    assert lru["a"] == 1  # "a" se usó: el menos usado ahora es "b"
    lru["c"] = 3
    assert list(lru) == ["a", "c"] and "b" not in lru
    lru["a"] = 10  # reemplazar también cuenta como uso
    lru["d"] = 4
    assert list(lru) == ["a", "d"]
