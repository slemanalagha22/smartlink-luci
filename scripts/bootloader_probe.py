"""
Find out what the router's bootloader offers, without flashing anything.

    python scripts/bootloader_probe.py

Run it, then power-cycle the router (holding its reset button if the vendor
documents that). For about two minutes this listens for the three ways an
MT7621 bootloader announces itself:

  * a TFTP read request, which tells us the exact filename it wants and the
    address it expects the server on
  * an HTTP recovery page appearing at one of the usual addresses
  * the device answering ping at one of them

Nothing is served and nothing is written. The point is to replace guesswork
with the device's own words: flashing the wrong image over a bootloader is
not recoverable without opening the case.
"""

import socket
import struct
import sys
import threading
import time

# Addresses MT7621 bootloaders are commonly reachable on. The first is
# stock U-Boot from the Ralink/MediaTek SDK, the rest are vendor and
# third-party recovery loaders.
CANDIDATES = [
    ("10.10.10.123", "MediaTek/Ralink U-Boot recovery"),
    ("192.168.1.1", "Breed / vendor web recovery, or a booted OpenWrt"),
    ("192.168.1.6", "some Xiaomi-derived loaders"),
    ("192.168.0.1", "vendor recovery"),
    ("192.168.20.1", "the address this router last had"),
]

TFTP_PORT = 69
RUN_SECONDS = 150

seen = {"tftp": [], "http": set(), "ping": set()}
stop = threading.Event()


def tftp_listener():
    """Log TFTP read requests. A bootloader that wants a file names it here."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

    try:
        sock.bind(("0.0.0.0", TFTP_PORT))
    except OSError as err:
        print("  ! could not listen for TFTP on port %d: %s" % (TFTP_PORT, err))
        print("    (another TFTP server may be running, or the port is blocked)")
        return

    sock.settimeout(1.0)
    print("  listening for TFTP requests on udp/%d" % TFTP_PORT)

    while not stop.is_set():
        try:
            data, addr = sock.recvfrom(1024)
        except socket.timeout:
            continue
        except OSError:
            break

        if len(data) < 4:
            continue

        opcode = struct.unpack("!H", data[:2])[0]
        parts = data[2:].split(b"\x00")
        name = parts[0].decode("latin-1", "replace") if parts else "?"
        kind = {1: "READ", 2: "WRITE"}.get(opcode, "op%d" % opcode)

        note = "%s from %s wants %r" % (kind, addr[0], name)

        if note not in seen["tftp"]:
            seen["tftp"].append(note)
            print("\n  >> TFTP %s" % note)

    sock.close()


def port_open(host, port, timeout=0.6):
    s = socket.socket()
    s.settimeout(timeout)

    try:
        s.connect((host, port))
        return True
    except OSError:
        return False
    finally:
        s.close()


def poller():
    """Watch the candidate addresses for a web page or an open port."""
    while not stop.is_set():
        for ip, what in CANDIDATES:
            if ip in seen["http"]:
                continue

            if port_open(ip, 80):
                seen["http"].add(ip)
                print("\n  >> HTTP on %s  (%s)" % (ip, what))

            if port_open(ip, 22):
                print("\n  >> SSH on %s - this is a booted system, not a loader" % ip)

        time.sleep(1.0)


def main():
    print(__doc__.strip().splitlines()[0])
    print()
    print("Watching for %d seconds. Power-cycle the router now." % RUN_SECONDS)
    print()

    threads = [
        threading.Thread(target=tftp_listener, daemon=True),
        threading.Thread(target=poller, daemon=True),
    ]

    for t in threads:
        t.start()

    start = time.time()

    try:
        while time.time() - start < RUN_SECONDS:
            left = int(RUN_SECONDS - (time.time() - start))
            print("\r  %3ds left   " % left, end="", flush=True)
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    stop.set()
    time.sleep(1.2)

    print("\n")
    print("=" * 62)

    if seen["tftp"]:
        print("TFTP requests seen:")
        for n in seen["tftp"]:
            print("  " + n)
        print()
        print("The bootloader does TFTP recovery. It named the file it wants;")
        print("only an image built for this exact board should ever be served.")
    elif seen["http"]:
        print("A web server answered at: %s" % ", ".join(sorted(seen["http"])))
        print("Open it in a browser - if it is a recovery page, it will say so.")
    else:
        print("Nothing announced itself.")
        print()
        print("That does not mean the device is dead. It means this bootloader")
        print("does not offer network recovery, or it needs a button held while")
        print("powering on, or the PC is not on the subnet it expects. A serial")
        print("console is the way to see what it is actually doing.")

    print("=" * 62)


if __name__ == "__main__":
    sys.exit(main())
