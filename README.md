# Raspberry Pi Statistics Web UI Dashboard

This is a Node.js backend + Web frontend to show live statistics of your Raspberry Pi on a display. Specifically the [HyperPixel 4.0 Square (720 x 720)](https://shop.pimoroni.com/products/hyperpixel-4-square).

Because this is only for my personal use, it's not created dynamic at all, and you might need to edit source code to change hard drives etc. I use this on a Raspberry Pi 5 with two NVME drives with Gigabit Ethernet, so that's what it's made for.

## Example

This is a screenrecording while performing a speedtest.

![](./assets/screencast.gif)

## Usage

0. Ensure Docker is installed.
1. Download this repository.
2. Run `$ start:docker:detach`.
3. Run `$ sudo apt install chromium-browser -y` to install the Chromium Webbrowser.
4. Run `$ sudo xinit /usr/bin/chromium-browser --no-sandbox --kiosk "http://localhost:3000"` to open a web browser. Hint: you can also add this to `/etc/rc.local` to start automatically on boot.
5. Maybe you need to run `DISPLAY=:0 xrandr --output "DPI-1" --rotate inverted` to rotate the display 180°.

## Contributing

Because this is only for my personal use, I'm not really open to contributions, but feel free to fork this repo and customize it.