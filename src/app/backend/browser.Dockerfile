# The browser container of Runs (backend.md 1.6): Playwright's run-server behind a firewall that refuses every
# outgoing connection to a non-public address. The backend connects to it at BROWSER_ENDPOINT.
# Build from the repository root: docker build -f src/app/backend/browser.Dockerfile .
FROM mcr.microsoft.com/playwright:v1.64.1-noble

# The image has the browsers of this Playwright version; the playwright package of the same version serves them.
RUN apt-get update \
  && apt-get install -y --no-install-recommends iptables \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g playwright@1.64.1

COPY src/app/backend/browser-firewall.sh /usr/local/bin/browser-firewall.sh
EXPOSE 3000
# Starts as root to set the firewall, then runs the server as pwuser without capabilities.
ENTRYPOINT ["/usr/local/bin/browser-firewall.sh"]
