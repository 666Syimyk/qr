import { useCallback } from "react";
import { Redirect, router } from "expo-router";
import { Page } from "../components/Page";
import { CardForm } from "../components/CardForm";
import { ErrorState, Loading } from "../components/ui";
import { useSession } from "../lib/session";
import { useRemote } from "../lib/useRemote";
export default function Edit() {
  const { api, token, ready } = useSession();
  const load = useCallback(() => api.getOwnerCard(token!), [api, token]);
  const state = useRemote(token ? load : null, { refreshOnForeground: false });
  if (ready && !token) return <Redirect href="/restore" />;
  return (
    <Page back="К моей карточке" title="Редактирование карточки" compact>
      {!ready || state.loading ? (
        <Loading />
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.refresh} />
      ) : state.data ? (
        <CardForm
          key={state.data.card.id}
          initial={state.data.card}
          editing
          onSubmit={async (input) => {
            await api.replaceCard(token!, input);
            router.replace("/my");
          }}
        />
      ) : null}
    </Page>
  );
}
