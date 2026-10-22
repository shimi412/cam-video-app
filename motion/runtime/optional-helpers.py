"""Approved pure subtitle lookup. Never executed by the observer itself."""
def find(seq, start=0):
    norm = lambda s: "".join(c for c in s.lower().replace("\u2019", "'").replace("\u201c", "").replace("\u201d", "") if c.isalnum() or c == "'")
    for i in range(start, len(words)):
        if [norm(x) for x in words[i:i + len(seq)]] == [norm(x) for x in seq]:
            return i
    raise ValueError(seq)
