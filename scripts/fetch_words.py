#!/usr/bin/env python3
"""
Fetch all 5-letter Russian words from vfrsute.ru and save to data/words.json and data/words.txt
"""

import json
import re
import time
import requests
from pathlib import Path

API_URL = "https://vfrsute.ru/api/v1/scanword/words/"
HEADERS = {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://vfrsute.ru/%D1%81%D0%BA%D0%B0%D0%BD%D0%B2%D0%BE%D1%80%D0%B4/%D1%81%D0%BB%D0%BE%D0%B2%D0%BE-%D0%B8%D0%B7-5-%D0%B1%D1%83%D0%BA%D0%B2/",
    "User-Agent": "Mozilla/5.0 (compatible; word-fetcher/1.0)",
}
DELAY_SECONDS = 0.5

SESSION = requests.Session()
SESSION.headers.update(HEADERS)


def fetch_batch(offset: int, part_speech: str = "существительное") -> dict:
    params = [
        ("letter[]", ""), ("letter[]", ""), ("letter[]", ""),
        ("letter[]", ""), ("letter[]", ""),
        ("including_letters", ""),
        ("excluding_letters", ""),
        ("part_speech", part_speech),
        ("words_list_sort", "asc"),
        ("offset", str(offset)),
    ]
    resp = SESSION.get(API_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def extract_words(html: str) -> list[str]:
    return re.findall(r'href="/([а-яёА-ЯЁ]+)/"', html)


def main():
    out_dir = Path(__file__).parent.parent / "data"
    out_dir.mkdir(exist_ok=True)

    all_words: list[str] = []
    offset = 0
    total = None

    print("Fetching Russian 5-letter words from vfrsute.ru...")

    while True:
        print(f"  offset={offset} ...", end=" ", flush=True)
        data = fetch_batch(offset)

        words = extract_words(data.get("words_html", ""))
        has_more = data.get("has_more", False)

        all_words.extend(w.lower() for w in words)
        print(f"got {len(words)} words (total so far: {len(all_words)})")

        if total is None:
            # total_words_found looks like: "Показаны первые <strong>200</strong> слов из <strong>11228</strong>."
            nums = re.findall(r"<strong>(\d+)</strong>", data.get("total_words_found", ""))
            if len(nums) >= 2:
                total = int(nums[-1])
                print(f"  Expected total: {total}")

        if not has_more or len(words) == 0:
            break

        offset += len(words)
        time.sleep(DELAY_SECONDS)

    # Deduplicate and sort
    all_words = sorted(set(all_words))
    print(f"\nDone. Total unique words: {len(all_words)}")

    # Save as JSON
    json_path = out_dir / "words.json"
    json_path.write_text(json.dumps(all_words, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved JSON: {json_path}")

    # Save as plain text (one word per line)
    txt_path = out_dir / "words.txt"
    txt_path.write_text("\n".join(all_words) + "\n", encoding="utf-8")
    print(f"Saved TXT:  {txt_path}")


if __name__ == "__main__":
    main()
