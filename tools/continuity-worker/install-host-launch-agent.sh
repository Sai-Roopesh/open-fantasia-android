#!/bin/zsh
set -eu

label="com.openfantasia.continuity-host"
plist="$HOME/Library/LaunchAgents/$label.plist"
here="$(cd "$(dirname "$0")" && pwd)"
node_bin="$(command -v node)"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/OpenFantasia"

cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array>
<string>$node_bin</string><string>$here/host-server.mjs</string>
</array>
<key>KeepAlive</key><true/>
<key>ProcessType</key><string>Interactive</string>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>$HOME/Library/Logs/OpenFantasia/continuity-host.log</string>
<key>StandardErrorPath</key><string>$HOME/Library/Logs/OpenFantasia/continuity-host.error.log</string>
</dict></plist>
EOF
chmod 600 "$plist"
"$node_bin" "$here/host-cli.mjs" init
echo "Installed $label (disabled until continuity-remote on)."
