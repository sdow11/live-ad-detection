"""Kivy touchscreen application for WiFi setup and device monitoring."""

import io
import threading
import logging
from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.textinput import TextInput
from kivy.uix.scrollview import ScrollView
from kivy.uix.popup import Popup
from kivy.uix.image import Image as KivyImage
from kivy.clock import Clock, mainthread
from kivy.core.image import Image as CoreImage
from kivy.graphics import Color, Rectangle
import qrcode
from PIL import Image as PILImage

from ..wifi_manager import WiFiManager
from ..device_info import DeviceMonitor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class NetworkListItem(BoxLayout):
    """Widget for displaying a network in the list."""

    def __init__(self, network, callback, **kwargs):
        super().__init__(**kwargs)
        self.orientation = 'horizontal'
        self.size_hint_y = None
        self.height = 80
        self.padding = 10
        self.spacing = 10

        # Add background
        with self.canvas.before:
            Color(0.95, 0.95, 0.95, 1)
            self.rect = Rectangle(pos=self.pos, size=self.size)

        self.bind(pos=self._update_rect, size=self._update_rect)

        # Network info
        info_layout = BoxLayout(orientation='vertical', size_hint_x=0.7)
        ssid_label = Label(
            text=network['ssid'],
            font_size='18sp',
            bold=True,
            color=(0, 0, 0, 1),
            halign='left',
            valign='middle'
        )
        ssid_label.bind(size=ssid_label.setter('text_size'))

        security_label = Label(
            text=network['security'],
            font_size='14sp',
            color=(0.4, 0.4, 0.4, 1),
            halign='left',
            valign='middle'
        )
        security_label.bind(size=security_label.setter('text_size'))

        info_layout.add_widget(ssid_label)
        info_layout.add_widget(security_label)

        # Signal strength
        signal_label = Label(
            text=f"{network['signal']}%",
            font_size='16sp',
            color=(0, 0, 0, 1),
            size_hint_x=0.2
        )

        # Connect button
        connect_btn = Button(
            text='Connect',
            size_hint_x=0.3,
            background_color=(0.2, 0.6, 1, 1)
        )
        connect_btn.bind(on_press=lambda x: callback(network))

        self.add_widget(info_layout)
        self.add_widget(signal_label)
        self.add_widget(connect_btn)

    def _update_rect(self, *args):
        self.rect.pos = self.pos
        self.rect.size = self.size


class DeviceInfoPanel(GridLayout):
    """Panel for displaying device information."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.cols = 2
        self.spacing = 10
        self.padding = 10
        self.size_hint_y = None
        self.height = 300

        self.info_labels = {}

        # Create info items
        info_items = [
            ('Hostname', 'hostname'),
            ('CPU Usage', 'cpu'),
            ('Memory', 'memory'),
            ('Disk Space', 'disk'),
            ('Uptime', 'uptime'),
            ('Network', 'network')
        ]

        for label_text, key in info_items:
            label = Label(
                text=label_text + ':',
                font_size='16sp',
                bold=True,
                color=(0.3, 0.3, 0.3, 1),
                halign='right',
                valign='middle'
            )
            label.bind(size=label.setter('text_size'))

            value = Label(
                text='...',
                font_size='16sp',
                color=(0, 0, 0, 1),
                halign='left',
                valign='middle'
            )
            value.bind(size=value.setter('text_size'))

            self.info_labels[key] = value

            self.add_widget(label)
            self.add_widget(value)

    def update_info(self, info):
        """Update device information display."""
        try:
            if 'system' in info:
                self.info_labels['hostname'].text = info['system'].get('hostname', 'Unknown')
                self.info_labels['uptime'].text = info['system'].get('uptime', 'Unknown')

            if 'cpu' in info:
                self.info_labels['cpu'].text = f"{info['cpu'].get('percent', 0):.1f}%"

            if 'memory' in info:
                mem = info['memory']
                self.info_labels['memory'].text = f"{mem.get('used_gb', 0):.1f}GB / {mem.get('total_gb', 0):.1f}GB"

            if 'disk' in info:
                disk = info['disk']
                self.info_labels['disk'].text = f"{disk.get('free_gb', 0):.1f}GB free"

            if 'network' in info and 'interfaces' in info['network']:
                interfaces = info['network']['interfaces']
                if interfaces:
                    first_if = list(interfaces.values())[0]
                    self.info_labels['network'].text = first_if.get('ip', 'No IP')
                else:
                    self.info_labels['network'].text = 'No connection'

        except Exception as e:
            logger.error(f"Error updating device info: {e}")


class TouchscreenApp(App):
    """Main touchscreen application."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.wifi_manager = WiFiManager()
        self.device_monitor = DeviceMonitor()
        self.networks = []

    def build(self):
        """Build the application UI."""
        # Main layout
        main_layout = BoxLayout(orientation='vertical', padding=10, spacing=10)

        # Header
        header = Label(
            text='Live Ad Detection - Setup',
            font_size='24sp',
            bold=True,
            size_hint_y=None,
            height=60,
            color=(1, 1, 1, 1)
        )
        with header.canvas.before:
            Color(0.4, 0.5, 0.9, 1)
            self.header_rect = Rectangle(pos=header.pos, size=header.size)

        header.bind(pos=self._update_header_rect, size=self._update_header_rect)

        # Current network status
        self.status_label = Label(
            text='Not connected',
            font_size='16sp',
            size_hint_y=None,
            height=40,
            color=(0, 0, 0, 1)
        )

        # Tabs/Sections
        tab_layout = BoxLayout(orientation='horizontal', size_hint_y=None, height=50, spacing=5)

        wifi_tab_btn = Button(
            text='WiFi Setup',
            background_color=(0.2, 0.6, 1, 1)
        )
        wifi_tab_btn.bind(on_press=lambda x: self.switch_tab('wifi'))

        info_tab_btn = Button(
            text='Device Info',
            background_color=(0.5, 0.5, 0.5, 1)
        )
        info_tab_btn.bind(on_press=lambda x: self.switch_tab('info'))

        qr_tab_btn = Button(
            text='QR Code',
            background_color=(0.5, 0.5, 0.5, 1)
        )
        qr_tab_btn.bind(on_press=lambda x: self.switch_tab('qr'))

        self.tab_buttons = {
            'wifi': wifi_tab_btn,
            'info': info_tab_btn,
            'qr': qr_tab_btn
        }

        tab_layout.add_widget(wifi_tab_btn)
        tab_layout.add_widget(info_tab_btn)
        tab_layout.add_widget(qr_tab_btn)

        # Content area
        self.content_area = BoxLayout(orientation='vertical')

        # WiFi Setup Content
        self.wifi_content = BoxLayout(orientation='vertical', spacing=10)

        scan_btn = Button(
            text='Scan for Networks',
            size_hint_y=None,
            height=60,
            font_size='18sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        scan_btn.bind(on_press=self.scan_networks)

        self.network_list_layout = BoxLayout(orientation='vertical', size_hint_y=1)
        scroll = ScrollView()
        self.network_list = GridLayout(cols=1, spacing=10, size_hint_y=None)
        self.network_list.bind(minimum_height=self.network_list.setter('height'))
        scroll.add_widget(self.network_list)
        self.network_list_layout.add_widget(scroll)

        self.wifi_content.add_widget(scan_btn)
        self.wifi_content.add_widget(self.network_list_layout)

        # Device Info Content
        self.info_content = ScrollView()
        self.device_info_panel = DeviceInfoPanel()
        self.info_content.add_widget(self.device_info_panel)

        # QR Code Content
        self.qr_content = BoxLayout(orientation='vertical', padding=20, spacing=20)

        qr_label = Label(
            text='Scan to access web interface',
            font_size='18sp',
            size_hint_y=None,
            height=40,
            color=(0, 0, 0, 1)
        )

        self.qr_image = KivyImage(size_hint=(1, 0.8))

        qr_refresh_btn = Button(
            text='Refresh QR Code',
            size_hint_y=None,
            height=60,
            font_size='16sp',
            background_color=(0.2, 0.6, 1, 1)
        )
        qr_refresh_btn.bind(on_press=lambda x: self.generate_qr_code())

        self.qr_content.add_widget(qr_label)
        self.qr_content.add_widget(self.qr_image)
        self.qr_content.add_widget(qr_refresh_btn)

        # Set initial content
        self.content_area.add_widget(self.wifi_content)

        # Add all to main layout
        main_layout.add_widget(header)
        main_layout.add_widget(self.status_label)
        main_layout.add_widget(tab_layout)
        main_layout.add_widget(self.content_area)

        # Start background updates
        Clock.schedule_interval(self.update_status, 10)
        Clock.schedule_interval(self.update_device_info, 10)
        Clock.schedule_once(lambda dt: self.update_status(None), 0.5)

        return main_layout

    def _update_header_rect(self, instance, value):
        """Update header background rectangle."""
        self.header_rect.pos = instance.pos
        self.header_rect.size = instance.size

    def switch_tab(self, tab_name):
        """Switch between tabs."""
        # Update button colors
        for name, btn in self.tab_buttons.items():
            if name == tab_name:
                btn.background_color = (0.2, 0.6, 1, 1)
            else:
                btn.background_color = (0.5, 0.5, 0.5, 1)

        # Switch content
        self.content_area.clear_widgets()

        if tab_name == 'wifi':
            self.content_area.add_widget(self.wifi_content)
        elif tab_name == 'info':
            self.content_area.add_widget(self.info_content)
            self.update_device_info(None)
        elif tab_name == 'qr':
            self.content_area.add_widget(self.qr_content)
            self.generate_qr_code()

    def scan_networks(self, instance):
        """Scan for WiFi networks in background."""
        instance.text = 'Scanning...'
        instance.disabled = True

        def scan_thread():
            networks = self.wifi_manager.scan_networks()
            Clock.schedule_once(lambda dt: self.display_networks(networks, instance), 0)

        threading.Thread(target=scan_thread, daemon=True).start()

    @mainthread
    def display_networks(self, networks, scan_btn):
        """Display scanned networks."""
        self.network_list.clear_widgets()
        self.networks = networks

        if networks:
            for network in networks:
                item = NetworkListItem(network, self.show_connect_popup)
                self.network_list.add_widget(item)
        else:
            label = Label(
                text='No networks found',
                size_hint_y=None,
                height=60,
                color=(0.5, 0.5, 0.5, 1)
            )
            self.network_list.add_widget(label)

        scan_btn.text = 'Scan for Networks'
        scan_btn.disabled = False

    def show_connect_popup(self, network):
        """Show popup to connect to network."""
        content = BoxLayout(orientation='vertical', padding=10, spacing=10)

        ssid_label = Label(
            text=f"Connect to: {network['ssid']}",
            size_hint_y=None,
            height=40,
            font_size='18sp',
            bold=True
        )

        password_input = TextInput(
            hint_text='Password (leave empty for open networks)',
            multiline=False,
            password=True,
            size_hint_y=None,
            height=60,
            font_size='18sp'
        )

        button_layout = BoxLayout(orientation='horizontal', size_hint_y=None, height=60, spacing=10)

        cancel_btn = Button(text='Cancel', background_color=(0.7, 0.7, 0.7, 1))
        connect_btn = Button(text='Connect', background_color=(0.2, 0.8, 0.2, 1))

        popup = Popup(
            title='Connect to Network',
            content=content,
            size_hint=(0.9, 0.5)
        )

        cancel_btn.bind(on_press=popup.dismiss)
        connect_btn.bind(on_press=lambda x: self.connect_to_network(
            network['ssid'], password_input.text, popup
        ))

        button_layout.add_widget(cancel_btn)
        button_layout.add_widget(connect_btn)

        content.add_widget(ssid_label)
        content.add_widget(password_input)
        content.add_widget(button_layout)

        popup.open()

    def connect_to_network(self, ssid, password, popup):
        """Connect to selected network."""
        popup.dismiss()

        # Show connecting status
        self.status_label.text = f'Connecting to {ssid}...'

        def connect_thread():
            success = self.wifi_manager.connect_to_network(ssid, password if password else None)
            Clock.schedule_once(lambda dt: self.on_connect_result(ssid, success), 0)

        threading.Thread(target=connect_thread, daemon=True).start()

    @mainthread
    def on_connect_result(self, ssid, success):
        """Handle connection result."""
        if success:
            self.status_label.text = f'Connected to {ssid}'
            self.status_label.color = (0, 0.6, 0, 1)
        else:
            self.status_label.text = f'Failed to connect to {ssid}'
            self.status_label.color = (1, 0, 0, 1)

        Clock.schedule_once(lambda dt: self.update_status(None), 2)

    def update_status(self, dt):
        """Update network status."""
        def status_thread():
            network = self.wifi_manager.get_current_network()
            Clock.schedule_once(lambda dt: self.display_status(network), 0)

        threading.Thread(target=status_thread, daemon=True).start()

    @mainthread
    def display_status(self, network):
        """Display network status."""
        if network:
            self.status_label.text = f"Connected to: {network['ssid']} ({network['signal']}%)"
            self.status_label.color = (0, 0.6, 0, 1)
        else:
            self.status_label.text = 'Not connected'
            self.status_label.color = (1, 0.5, 0, 1)

    def update_device_info(self, dt):
        """Update device information."""
        def info_thread():
            info = self.device_monitor.get_all_info()
            Clock.schedule_once(lambda dt: self.device_info_panel.update_info(info), 0)

        threading.Thread(target=info_thread, daemon=True).start()

    def generate_qr_code(self):
        """Generate QR code for web interface access."""
        def qr_thread():
            try:
                # Get IP address
                ip = self.wifi_manager.get_ip_address() or '192.168.4.1'
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

                # Convert to Kivy image
                data = io.BytesIO()
                img.save(data, format='PNG')
                data.seek(0)

                Clock.schedule_once(lambda dt: self.display_qr_code(data), 0)

            except Exception as e:
                logger.error(f"Error generating QR code: {e}")

        threading.Thread(target=qr_thread, daemon=True).start()

    @mainthread
    def display_qr_code(self, data):
        """Display QR code image."""
        core_image = CoreImage(data, ext='png')
        self.qr_image.texture = core_image.texture


def main():
    """Main entry point for touchscreen UI."""
    TouchscreenApp().run()


if __name__ == '__main__':
    main()
