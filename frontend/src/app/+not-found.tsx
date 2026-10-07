import { router } from "expo-router";
import { Page, PageTitle } from "../components/Page";
import { Button } from "../components/ui";
export default function NotFound() {
  return (
    <Page compact>
      <PageTitle
        title="Страница не найдена"
        description="Проверьте ссылку или вернитесь на главную."
      />
      <Button label="На главную" onPress={() => router.replace("/")} />
    </Page>
  );
}
