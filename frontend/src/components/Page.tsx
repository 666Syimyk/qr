import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
} from "react";
import {
  Pressable,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { router, usePathname, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors as c } from "./theme";
import { Icon, type IconName } from "./Icon";
import { Brand } from "./Brand";
import { Button, Notice } from "./ui";
import { useSession } from "../lib/session";
const BackContext = createContext<{ current: (() => boolean) | null } | null>(
  null,
);
export function usePageBack(handler: () => boolean) {
  const ref = useContext(BackContext);
  useEffect(() => {
    if (!ref) return;
    ref.current = handler;
    return () => {
      if (ref.current === handler) ref.current = null;
    };
  }, [ref, handler]);
}
const titles: Record<string, string> = {
  "/create": "Создание карточки",
  "/edit": "Редактирование карточки",
  "/restore": "Вход по ключу",
  "/my": "Мой QR-код",
  "/profile": "Профиль",
  "/about": "О проекте",
  "/help": "Как это работает",
};
export function Page({
  children,
  back,
  compact = false,
  title,
  landing = false,
  scenic = false,
}: PropsWithChildren<{
  back?: string;
  compact?: boolean;
  title?: string;
  landing?: boolean;
  scenic?: boolean;
}>) {
  const { width } = useWindowDimensions();
  const desktop = width >= 800;
  const path = usePathname();
  const { token, storageWarning, logout } = useSession();
  const backRef = useRef<(() => boolean) | null>(null);
  const publicView = path.startsWith("/q/");
  const showTabs = !desktop && ["/my", "/profile"].includes(path);
  const showBack = path !== "/";
  const goBack = () => {
    if (backRef.current?.()) return;
    if (path === "/edit") {
      router.replace("/my");
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const navigation = [
    { label: "Главная", path: "/" },
    { label: "О проекте", path: "/about" },
    { label: "Как это работает", path: "/help" },
  ];
  return (
    <SafeAreaView
      style={[s.safe, landing && !desktop && { backgroundColor: "#182D3D" }]}
      edges={["top", "left", "right", "bottom"]}
    >
      {scenic && (
        <ImageBackground
          source={require("../../assets/images/hero-mountains.png")}
          style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
          imageStyle={{ width: "100%", height: "100%" }}
          resizeMode="cover"
        >
          <View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: "rgba(12,29,44,0.38)" },
            ]}
          />
        </ImageBackground>
      )}
      <BackContext.Provider value={backRef}>
        {!(landing && !desktop) && (
          <View style={s.headerWrap}>
            <View style={[s.header, { paddingHorizontal: desktop ? 32 : 20 }]}>
              {desktop ? (
                <>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel="Emergency QR — главная"
                    onPress={() => router.navigate("/")}
                  >
                    <Brand />
                  </Pressable>
                  {!publicView && (
                    <View style={s.navigation}>
                      {navigation.map((item) => (
                        <Pressable
                          key={item.path}
                          accessibilityRole="link"
                          accessibilityState={{ selected: path === item.path }}
                          onPress={() => router.navigate(item.path as Href)}
                          style={s.navLink}
                        >
                          <Text
                            style={[
                              s.navText,
                              path === item.path && { color: c.primary },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {!publicView && !["/create", "/edit"].includes(path) && (
                    <Button
                      label={token ? "Мой QR-код" : "Создать карточку"}
                      onPress={() => router.navigate(token ? "/my" : "/create")}
                      icon={token ? "qr" : undefined}
                      style={{ minHeight: 42, paddingVertical: 9 }}
                    />
                  )}
                </>
              ) : (
                <>
                  {showBack ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Назад"
                      onPress={goBack}
                      style={s.backButton}
                    >
                      <Icon name="back" color={c.ink} size={23} />
                    </Pressable>
                  ) : (
                    <View style={{ width: 44 }} />
                  )}
                  <Text accessibilityRole="header" style={s.mobileTitle}>
                    {title ?? titles[path] ?? "Emergency QR"}
                  </Text>
                  <View style={{ width: 44 }} />
                </>
              )}
            </View>
          </View>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          <View
            style={[
              s.content,
              landing
                ? {
                    maxWidth: "100%",
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingHorizontal: 0,
                  }
                : {
                    maxWidth: compact ? 650 : 1200,
                    paddingHorizontal: desktop ? 28 : 20,
                    paddingTop: desktop ? 32 : 24,
                    paddingBottom: 40,
                  },
            ]}
          >
            {desktop && showBack && (
              <View style={s.desktopBack}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Назад"
                  onPress={goBack}
                  style={[s.backRow, scenic && s.scenicBack]}
                >
                  <Icon
                    name="back"
                    color={scenic ? c.ink : c.muted}
                    size={19}
                  />
                  <Text style={[s.backText, scenic && { color: c.ink }]}>
                    {back ?? "Назад"}
                  </Text>
                </Pressable>
                {title && (
                  <Text style={[s.desktopTitle, scenic && { color: c.white }]}>
                    {title}
                  </Text>
                )}
              </View>
            )}
            {storageWarning && (
              <View
                style={{ gap: 10, marginBottom: 20, padding: landing ? 20 : 0 }}
              >
                <Notice tone="warning">{storageWarning}</Notice>
                {!token && (
                  <Button
                    label="Повторить очистку ключа на устройстве"
                    kind="secondary"
                    onPress={() => void logout()}
                  />
                )}
              </View>
            )}
            {children}
          </View>
          {desktop && (
            <View style={s.footer}>
              <Brand />
              <Text style={s.footerText}>
                Контакт близкого человека — всегда под рукой.
              </Text>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.navigate("/help" as Href)}
              >
                <Text style={s.footerText}>Помощь</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
        {showTabs && (
          <View style={s.tabs}>
            {(
              [
                { label: "Главная", path: "/", icon: "home" },
                { label: "QR-код", path: "/my", icon: "qr" },
                { label: "Профиль", path: "/profile", icon: "user" },
              ] as { label: string; path: string; icon: IconName }[]
            ).map((item) => (
              <Pressable
                key={item.path}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: path === item.path }}
                aria-selected={path === item.path}
                onPress={() => router.navigate(item.path as Href)}
                style={s.tab}
              >
                <Icon
                  name={item.icon}
                  color={path === item.path ? c.primary : c.muted}
                  size={23}
                />
                <Text
                  style={[
                    s.tabText,
                    { color: path === item.path ? c.primary : c.muted },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </BackContext.Provider>
    </SafeAreaView>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={s.titleBlock}>
      {eyebrow && <Text style={s.eyebrow}>{eyebrow}</Text>}
      <Text accessibilityRole="header" style={s.title}>
        {title}
      </Text>
      {description && <Text style={s.description}>{description}</Text>}
    </View>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.background },
  headerWrap: {
    backgroundColor: c.white,
    borderBottomWidth: 1,
    borderColor: c.line,
  },
  header: {
    width: "100%",
    maxWidth: 1264,
    alignSelf: "center",
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  navigation: { flexDirection: "row", gap: 26 },
  navLink: { minHeight: 44, justifyContent: "center" },
  navText: { fontSize: 14, fontWeight: "600", color: c.ink },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  mobileTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: c.ink,
    flex: 1,
    textAlign: "center",
  },
  content: { width: "100%", alignSelf: "center", flex: 1 },
  desktopBack: { marginBottom: 24, gap: 18 },
  backRow: {
    flexDirection: "row",
    gap: 8,
    minHeight: 36,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backText: { fontSize: 13, color: c.muted },
  scenicBack: {
    backgroundColor: c.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  desktopTitle: {
    fontSize: 27,
    fontWeight: "700",
    textAlign: "center",
    color: c.ink,
  },
  footer: {
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.white,
    paddingHorizontal: 40,
    paddingVertical: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 24,
  },
  footerText: { fontSize: 12, color: c.muted },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: c.line,
    backgroundColor: c.white,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    gap: 5,
  },
  tabText: { fontSize: 11, fontWeight: "500" },
  titleBlock: { gap: 10, marginBottom: 24 },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: c.primary,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 36,
    color: c.ink,
  },
  description: { fontSize: 15, lineHeight: 24, color: c.muted, maxWidth: 630 },
});
