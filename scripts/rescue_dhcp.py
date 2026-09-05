"""
Hand the router an address so it can be reached again.

    python scripts/rescue_dhcp.py

A router left in access-point mode with `proto dhcp` on its LAN is not broken -
it is asking for an address that nobody is answering. This serves exactly one
lease on the directly-connected cable, which is enough to bring the web
interface back without flashing anything.

Run it, then power-cycle the router and let it boot normally (do not run
BreedEnter this time). When the lease is taken the address is printed; open it
in a browser, or point scripts/deploy_ubus.py at it.
"""

import socket
import struct
import sys
import time

# The address handed out, and the one this machine already answers on.
LEASE_IP = "192.168.1.50"
SERVER_IP = "192.168.1.2"
NETMASK = "255.255.255.0"
LEASE_SECONDS = 3600

MAGIC = bytes([99, 130, 83, 99])          # DHCP cookie
DISCOVER, OFFER, REQUEST, ACK = 1, 2, 3, 5


def parse_options(payload):
    """DHCP options as {code: bytes}, stopping at the end marker."""
    out = {}
    i = 0

    while i < len(payload):
        code = payload[i]

        if code == 255:
            break

        if code == 0:
            i += 1
            continue

        if i + 1 >= len(payload):
            break

        length = payload[i + 1]
        out[code] = payload[i + 2:i + 2 + length]
        i += 2 + length

    return out


def build_reply(request, message_type):
    """A BOOTP reply carrying the offer or acknowledgement."""
    xid = request[4:8]
    chaddr = request[28:44]

    packet = b"".join([
        bytes([2, 1, 6, 0]),                       # reply, ethernet, hlen 6
        xid,
        struct.pack("!HH", 0, 0x8000),             # secs, broadcast flag
        socket.inet_aton("0.0.0.0"),               # ciaddr
        socket.inet_aton(LEASE_IP),                # yiaddr - the offer
        socket.inet_aton("0.0.0.0"),               # siaddr
        socket.inet_aton("0.0.0.0"),               # giaddr
        chaddr,
        b"\x00" * 64,                              # sname
        b"\x00" * 128,                             # file
        MAGIC,
    ])

    def opt(code, value):
        return bytes([code, len(value)]) + value

    packet += opt(53, bytes([message_type]))
    packet += opt(54, socket.inet_aton(SERVER_IP))          # server id
    packet += opt(51, struct.pack("!I", LEASE_SECONDS))     # lease time
    packet += opt(1, socket.inet_aton(NETMASK))
    packet += opt(3, socket.inet_aton(SERVER_IP))           # gateway
    packet += opt(6, socket.inet_aton(SERVER_IP))           # dns
    packet += b"\xff"

    return packet


def mac_of(request):
    return ":".join("%02x" % b for b in request[28:34])


def main():
    print(__doc__.strip().splitlines()[0])
    print()

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)

    try:
        sock.bind(("0.0.0.0", 67))
    except OSError as err:
        sys.exit("could not listen on udp/67: %s" % err)

    print("  offering %s to whoever asks, on behalf of %s" % (LEASE_IP, SERVER_IP))
    print("  power-cycle the router now and let it boot normally")
    print("  (do not run BreedEnter this time)")
    print()
    print("  waiting...")

    sock.settimeout(2.0)
    seen = set()
    acked = False
    start = time.time()

    while time.time() - start < 600:
        try:
            data, addr = sock.recvfrom(2048)
        except socket.timeout:
            continue
        except OSError:
            break

        if len(data) < 240 or data[236:240] != MAGIC:
            continue

        options = parse_options(data[240:])
        kind = options.get(53, b"\x00")[0]
        mac = mac_of(data)

        if mac not in seen:
            seen.add(mac)
            host = options.get(12, b"").decode("latin-1", "replace")
            print("\n  client %s%s" % (mac, (" (%s)" % host) if host else ""))

        if kind == DISCOVER:
            sock.sendto(build_reply(data, OFFER), ("255.255.255.255", 68))
            print("    offered %s" % LEASE_IP)
        elif kind == REQUEST:
            sock.sendto(build_reply(data, ACK), ("255.255.255.255", 68))
            print("    acknowledged %s" % LEASE_IP)
            acked = True
            break

    sock.close()

    if not acked:
        print("\n  nothing asked for an address.")
        print()
        print("  Either the router has not booted yet, its LAN is not on this")
        print("  cable, or Windows Firewall dropped the request - inbound udp/67")
        print("  needs to be allowed for python.exe.")
        return 1

    print()
    print("  the router should now answer on http://%s/" % LEASE_IP)

    for _ in range(30):
        s = socket.socket()
        s.settimeout(1.0)

        try:
            s.connect((LEASE_IP, 80))
            print("  confirmed: port 80 is open on %s" % LEASE_IP)
            return 0
        except OSError:
            time.sleep(2)
        finally:
            s.close()

    print("  it took the lease but is not serving yet; give it a moment.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
