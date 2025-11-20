"""Flask web application for WiFi configuration."""

import os
import io
import logging
import qrcode
from flask import Flask, render_template, request, jsonify, send_file, Response
from ..wifi_manager import WiFiManager
from ..device_info import DeviceMonitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.urandom(24)

    wifi_manager = WiFiManager()
    device_monitor = DeviceMonitor()

    @app.route('/')
    def index():
        """Main page with WiFi setup interface."""
        return render_template('index.html')

    @app.route('/api/scan', methods=['GET'])
    def scan_networks():
        """Scan for available WiFi networks."""
        try:
            networks = wifi_manager.scan_networks()
            return jsonify({
                'success': True,
                'networks': networks
            })
        except Exception as e:
            logger.error(f"Error scanning networks: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/connect', methods=['POST'])
    def connect_network():
        """Connect to a WiFi network."""
        try:
            data = request.get_json()
            ssid = data.get('ssid')
            password = data.get('password', '')

            if not ssid:
                return jsonify({
                    'success': False,
                    'error': 'SSID is required'
                }), 400

            success = wifi_manager.connect_to_network(ssid, password if password else None)

            if success:
                return jsonify({
                    'success': True,
                    'message': f'Successfully connected to {ssid}'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Failed to connect to network'
                }), 500

        except Exception as e:
            logger.error(f"Error connecting to network: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/current', methods=['GET'])
    def current_network():
        """Get current network connection."""
        try:
            network = wifi_manager.get_current_network()
            return jsonify({
                'success': True,
                'network': network
            })
        except Exception as e:
            logger.error(f"Error getting current network: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/device/info', methods=['GET'])
    def device_info():
        """Get device information."""
        try:
            info = device_monitor.get_all_info()
            return jsonify({
                'success': True,
                'info': info
            })
        except Exception as e:
            logger.error(f"Error getting device info: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/qr/connection', methods=['GET'])
    def qr_connection():
        """Generate QR code for connecting to device's AP."""
        try:
            # Get the device's IP address
            ip = wifi_manager.get_ip_address()
            if not ip:
                ip = request.host.split(':')[0]

            # Create URL for accessing the web interface
            url = f"http://{ip}:5000"

            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(url)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            # Convert to bytes
            img_io = io.BytesIO()
            img.save(img_io, 'PNG')
            img_io.seek(0)

            return send_file(img_io, mimetype='image/png')

        except Exception as e:
            logger.error(f"Error generating QR code: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/qr/wifi', methods=['GET'])
    def qr_wifi():
        """Generate QR code for WiFi connection (Android/iOS compatible)."""
        try:
            ssid = request.args.get('ssid', 'LiveAdDetection')
            password = request.args.get('password', '')

            # WiFi QR format: WIFI:T:<security>;S:<ssid>;P:<password>;;
            security = 'WPA' if password else 'nopass'
            wifi_string = f"WIFI:T:{security};S:{ssid};P:{password};;"

            # Generate QR code
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_L,
                box_size=10,
                border=4,
            )
            qr.add_data(wifi_string)
            qr.make(fit=True)

            img = qr.make_image(fill_color="black", back_color="white")

            # Convert to bytes
            img_io = io.BytesIO()
            img.save(img_io, 'PNG')
            img_io.seek(0)

            return send_file(img_io, mimetype='image/png')

        except Exception as e:
            logger.error(f"Error generating WiFi QR code: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/ap/start', methods=['POST'])
    def start_ap():
        """Start access point mode."""
        try:
            data = request.get_json() or {}
            ssid = data.get('ssid', 'LiveAdDetection')
            password = data.get('password')

            success = wifi_manager.start_access_point(ssid, password)

            if success:
                return jsonify({
                    'success': True,
                    'message': f'Access point {ssid} started'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Failed to start access point'
                }), 500

        except Exception as e:
            logger.error(f"Error starting AP: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    @app.route('/api/ap/stop', methods=['POST'])
    def stop_ap():
        """Stop access point mode."""
        try:
            success = wifi_manager.stop_access_point()

            if success:
                return jsonify({
                    'success': True,
                    'message': 'Access point stopped'
                })
            else:
                return jsonify({
                    'success': False,
                    'error': 'Failed to stop access point'
                }), 500

        except Exception as e:
            logger.error(f"Error stopping AP: {e}")
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500

    return app


def main():
    """Main entry point for web interface."""
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)


if __name__ == '__main__':
    main()
