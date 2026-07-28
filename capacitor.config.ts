import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vitrin.panel',
  appName: 'Vitrin',
  webDir: 'dist',
  // Canlı-yeniden-yükleme (live-reload) geliştirme modunu geri açmak için
  // aşağıdaki server bloğunun yorumunu kaldırıp kendi bilgisayarının yerel
  // ağ IP'sini yaz. Production/beta build'lerde bu blok KAPALI kalmalı —
  // açıkken APK, telefonun bağlı olduğu WiFi'deki geliştirme sunucusuna
  // bağlanmaya çalışır ve o ağ dışında çalışmaz.
  // server: {
  //   url: 'http://<bilgisayarinin-yerel-ip-adresi>:5173',
  //   cleartext: true,
  // },
};

export default config;
