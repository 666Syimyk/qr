import { router } from "expo-router";
import { View } from "react-native";
import { Page } from "../components/Page";
import { CardForm } from "../components/CardForm";
import { Notice } from "../components/ui";
import { useSession } from "../lib/session";
export default function Create() {
  const { api, saveToken, token } = useSession();
  return (
    <Page back="На главную" title="Создание карточки" compact>
      {token && (
        <View style={{ marginBottom: 20 }}>
          <Notice tone="warning">
            У вас уже открыта карточка. Перед созданием новой сохраните её
            секретный ключ: активный доступ переключится на новую карточку.
          </Notice>
        </View>
      )}
      <CardForm
        onSubmit={async (input) => {
          const result = await api.createCard(input);
          await saveToken(result.ownerToken);
          router.replace("/my");
        }}
      />
    </Page>
  );
}
