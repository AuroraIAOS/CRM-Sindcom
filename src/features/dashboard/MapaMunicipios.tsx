import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GeoJSON, MapContainer, useMap } from "react-leaflet";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ChartCard } from "@/components/shared/ChartCard";
import { COR_EIXO, COR_MAPA_SEM_DADO, COR_MARCA, ESCALA_MAPA } from "./cores";
import { useGeoJson, useMapa, type LinhaMapa } from "./api";

/**
 * M1 — mapa coroplético da base territorial (specs/dashboard.md §2, linha 3).
 *
 * Sem TileLayer: a malha dos 29 municípios é a informação inteira, e um mapa
 * de fundo exigiria requisição a servidor externo (OpenStreetMap) a cada
 * carga. Sem ele o widget funciona offline — o que a Subetapa 03.3 vai
 * exigir — e não vaza navegação do usuário para terceiros.
 *
 * O join com o banco é por `codigo_ibge` (seed 01b garante o código nos 29).
 */

type Metrica = { chave: keyof LinhaMapa; label: string; unidade: string };

const METRICAS: Metrica[] = [
  { chave: "total_trabalhadores", label: "Total de trabalhadores", unidade: "trabalhador(es)" },
  { chave: "bronze", label: "Bronze", unidade: "trabalhador(es)" },
  { chave: "prata", label: "Prata", unidade: "trabalhador(es)" },
  { chave: "ouro", label: "Ouro", unidade: "trabalhador(es)" },
  { chave: "estabelecimentos_ativos", label: "Estabelecimentos ativos", unidade: "estabelecimento(s)" },
];

/**
 * Corta a escala em 5 faixas por quantis dos valores **maiores que zero**.
 * Zero fica de fora de propósito: município sem registro não é "intensidade
 * baixa", é ausência de dado, e recebe cor própria (branco). Misturar os dois
 * pintaria de creme quem tem 1 trabalhador e quem não tem nenhum.
 */
function construirFaixas(valores: number[]): number[] {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return [];
  const quantil = (p: number) => positivos[Math.min(positivos.length - 1, Math.floor(p * positivos.length))];
  return [...new Set([quantil(0.2), quantil(0.4), quantil(0.6), quantil(0.8)])];
}

function corDaFaixa(valor: number, faixas: number[]): string {
  if (valor <= 0) return COR_MAPA_SEM_DADO;
  let i = 0;
  while (i < faixas.length && valor > faixas[i]) i++;
  return ESCALA_MAPA[Math.min(i, ESCALA_MAPA.length - 1)];
}

/** Enquadra o mapa na malha assim que ela carrega (nada de centro fixo
 *  chutado — a base territorial define o enquadramento). */
function AjustarEnquadramento({ geo }: { geo: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    const camada = L.geoJSON(geo);
    map.fitBounds(camada.getBounds(), { padding: [8, 8] });
  }, [geo, map]);
  return null;
}

export function MapaMunicipios({ habilitado = true }: { habilitado?: boolean }) {
  const navigate = useNavigate();
  const [metrica, setMetrica] = useState<Metrica>(METRICAS[0]);

  const dados = useMapa(habilitado);
  const geo = useGeoJson(habilitado);

  const porCodigo = useMemo(() => {
    const m = new Map<number, LinhaMapa>();
    for (const l of dados.data ?? []) if (l.codigo_ibge !== null) m.set(l.codigo_ibge, l);
    return m;
  }, [dados.data]);

  const faixas = useMemo(
    () => construirFaixas((dados.data ?? []).map((l) => Number(l[metrica.chave] ?? 0))),
    [dados.data, metrica],
  );

  const estilo = (feature?: Feature<Geometry, { codigo_ibge: number }>): PathOptions => {
    const linha = feature ? porCodigo.get(feature.properties.codigo_ibge) : undefined;
    const valor = Number(linha?.[metrica.chave] ?? 0);
    const sede = linha?.sede === true;
    return {
      fillColor: corDaFaixa(valor, faixas),
      fillOpacity: 0.85,
      // Passos (sede) sai destacada com contorno mais forte — dashboard.md/M1.
      color: sede ? COR_MARCA.realce : COR_EIXO,
      weight: sede ? 3 : 1,
      opacity: 1,
    };
  };

  const aoCriarCamada = (feature: Feature<Geometry, { codigo_ibge: number }>, camada: Layer) => {
    const linha = porCodigo.get(feature.properties.codigo_ibge);
    if (!linha) return;

    camada.bindTooltip(
      `<div style="font-family: Lato, sans-serif; font-size: 12px">
         <strong>${linha.nome ?? ""}${linha.sede ? " (sede)" : ""}</strong><br/>
         ${linha.total_trabalhadores ?? 0} trabalhador(es)<br/>
         Bronze ${linha.bronze ?? 0} · Prata ${linha.prata ?? 0} · Ouro ${linha.ouro ?? 0}<br/>
         ${linha.estabelecimentos_ativos ?? 0} estabelecimento(s) ativo(s)
       </div>`,
      { sticky: true },
    );
    camada.on("click", () => navigate(`/trabalhadores?municipio=${linha.municipio_id}`));
  };

  const carregando = dados.isPending || geo.isPending;
  const erro = dados.error ?? geo.error;

  return (
    <ChartCard
      titulo="Base territorial (29 municípios)"
      descricao="Município onde o trabalhador atua (estabelecimento do vínculo principal); sem vínculo, a residência"
      carregando={carregando}
      erro={erro}
      vazio={!geo.data || (dados.data?.length ?? 0) === 0}
      mensagemVazio="Malha municipal indisponível."
      altura={420}
      acoes={
        <select
          value={String(metrica.chave)}
          onChange={(e) =>
            setMetrica(METRICAS.find((m) => m.chave === e.target.value) ?? METRICAS[0])
          }
          aria-label="Métrica exibida no mapa"
          className="rounded-md border border-input bg-background px-2 py-1 text-xs text-texto-1"
        >
          {METRICAS.map((m) => (
            <option key={String(m.chave)} value={String(m.chave)}>
              {m.label}
            </option>
          ))}
        </select>
      }
    >
      <div className="flex h-full flex-col gap-2">
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
          {geo.data ? (
            <MapContainer
              // `key` força remontagem quando a métrica muda: o Leaflet não
              // recalcula estilo sozinho ao trocar a função de estilo.
              key={String(metrica.chave)}
              style={{ height: "100%", width: "100%", background: COR_MARCA.fundo1 }}
              zoomControl
              scrollWheelZoom={false}
              attributionControl={false}
            >
              <AjustarEnquadramento geo={geo.data} />
              <GeoJSON
                data={geo.data}
                style={estilo as PathOptions}
                onEachFeature={aoCriarCamada as (f: Feature, l: Layer) => void}
              />
            </MapContainer>
          ) : null}
        </div>
        <Legenda faixas={faixas} unidade={metrica.unidade} />
      </div>
    </ChartCard>
  );
}

function Legenda({ faixas, unidade }: { faixas: number[]; unidade: string }) {
  if (faixas.length === 0) {
    return (
      <p className="text-xs text-texto-2">
        Nenhum município com registro nesta métrica — a escala aparece quando houver dado.
      </p>
    );
  }

  // Faixa de um valor só vira o número puro: "1–1" é ruído, "1" é a informação.
  const intervalo = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);

  const rotulos = [
    intervalo(1, faixas[0]),
    ...faixas.slice(0, -1).map((f, i) => intervalo(f + 1, faixas[i + 1])),
    `${faixas[faixas.length - 1] + 1}+`,
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-2">
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-3 w-3 rounded-sm border border-border"
          style={{ background: COR_MAPA_SEM_DADO }}
        />
        sem registro
      </span>
      {rotulos.map((r, i) => (
        <span key={r + i} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-border"
            style={{ background: ESCALA_MAPA[i] }}
          />
          {r}
        </span>
      ))}
      <span className="text-texto-2">{unidade}</span>
    </div>
  );
}
