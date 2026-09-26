# Read-only: print cached USB configuration descriptors for the OP-XY (no open, no claim, no transfers).
import usb.core, usb.util
d = usb.core.find(idVendor=0x2367, idProduct=0x8021)
print(d is not None and f"bcdUSB={d.bcdUSB:#06x} bcdDevice={d.bcdDevice:#06x} numConfigs={d.bNumConfigurations}")
CLASS = {1:'Audio',2:'CDC',3:'HID',6:'StillImage(MTP/PTP)',8:'MassStorage',0xFE:'AppSpecific',0xFF:'Vendor'}
for cfg in d:
    print(f"\nConfig {cfg.bConfigurationValue}: iConfiguration={cfg.iConfiguration} ifaces={cfg.bNumInterfaces} maxPower={cfg.bMaxPower*2}mA")
    for intf in cfg:
        print(f"  if{intf.bInterfaceNumber} alt{intf.bAlternateSetting} class={intf.bInterfaceClass:#04x}({CLASS.get(intf.bInterfaceClass,'?')}) sub={intf.bInterfaceSubClass:#04x} proto={intf.bInterfaceProtocol:#04x} eps={intf.bNumEndpoints}")
