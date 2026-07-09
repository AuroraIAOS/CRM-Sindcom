// Tipos gerados do schema Supabase (public). NAO editar a mao.
// Regenerar: mcp Supabase generate_typescript_types.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      atendimentos_juridicos: {
        Row: {
          created_at: string
          data: string
          id: string
          responsavel: string | null
          resumo: string | null
          status: string
          tipo: Database["public"]["Enums"]["tipo_atend_juridico"]
          trabalhador_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: string
          id?: string
          responsavel?: string | null
          resumo?: string | null
          status?: string
          tipo: Database["public"]["Enums"]["tipo_atend_juridico"]
          trabalhador_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          id?: string
          responsavel?: string | null
          resumo?: string | null
          status?: string
          tipo?: Database["public"]["Enums"]["tipo_atend_juridico"]
          trabalhador_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_juridicos_responsavel_fkey"
            columns: ["responsavel"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_juridicos_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_juridicos_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "atendimentos_juridicos_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "atendimentos_juridicos_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      auditoria: {
        Row: {
          created_at: string
          dados_antes: Json | null
          dados_depois: Json | null
          id: number
          operacao: Database["public"]["Enums"]["operacao_auditoria"]
          registro_id: string | null
          tabela: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: never
          operacao: Database["public"]["Enums"]["operacao_auditoria"]
          registro_id?: string | null
          tabela: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: never
          operacao?: Database["public"]["Enums"]["operacao_auditoria"]
          registro_id?: string | null
          tabela?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      beneficiados: {
        Row: {
          ativo: boolean
          cpf: string
          created_at: string
          data_nascimento: string | null
          id: string
          nome: string
          parentesco: string | null
          status_cadastro: Database["public"]["Enums"]["status_cadastro"]
          tipo: Database["public"]["Enums"]["tipo_beneficiado"]
          titular_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf: string
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome: string
          parentesco?: string | null
          status_cadastro?: Database["public"]["Enums"]["status_cadastro"]
          tipo: Database["public"]["Enums"]["tipo_beneficiado"]
          titular_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf?: string
          created_at?: string
          data_nascimento?: string | null
          id?: string
          nome?: string
          parentesco?: string | null
          status_cadastro?: Database["public"]["Enums"]["status_cadastro"]
          tipo?: Database["public"]["Enums"]["tipo_beneficiado"]
          titular_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beneficiados_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficiados_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "beneficiados_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "beneficiados_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      beneficios: {
        Row: {
          ativo: boolean
          categoria: string | null
          condicoes: string | null
          created_at: string
          descricao: string | null
          id: string
          nivel_minimo: Database["public"]["Enums"]["nivel_protecao"]
          nome: string
          parceiro_id: string
          updated_at: string
          valor_convenio: number | null
          valor_particular: number | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          condicoes?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nivel_minimo?: Database["public"]["Enums"]["nivel_protecao"]
          nome: string
          parceiro_id: string
          updated_at?: string
          valor_convenio?: number | null
          valor_particular?: number | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          condicoes?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nivel_minimo?: Database["public"]["Enums"]["nivel_protecao"]
          nome?: string
          parceiro_id?: string
          updated_at?: string
          valor_convenio?: number | null
          valor_particular?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficios_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beneficios_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_dash_top_parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      cartas_oposicao: {
        Row: {
          ano_base: number
          comprovante_url: string | null
          created_at: string
          data_entrega: string
          forma: Database["public"]["Enums"]["forma_entrega_carta"]
          id: string
          registrada_por: string | null
          trabalhador_id: string
        }
        Insert: {
          ano_base: number
          comprovante_url?: string | null
          created_at?: string
          data_entrega: string
          forma?: Database["public"]["Enums"]["forma_entrega_carta"]
          id?: string
          registrada_por?: string | null
          trabalhador_id: string
        }
        Update: {
          ano_base?: number
          comprovante_url?: string | null
          created_at?: string
          data_entrega?: string
          forma?: Database["public"]["Enums"]["forma_entrega_carta"]
          id?: string
          registrada_por?: string | null
          trabalhador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cartas_oposicao_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_oposicao_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cartas_oposicao_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "cartas_oposicao_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "cartas_oposicao_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      cnaes: {
        Row: {
          codigo: string
          descricao: string
        }
        Insert: {
          codigo: string
          descricao: string
        }
        Update: {
          codigo?: string
          descricao?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      convencoes_coletivas: {
        Row: {
          ano_base: number
          created_at: string
          data_fim_vigencia: string | null
          data_inicio_vigencia: string
          data_limite_oposicao: string | null
          documento_url: string | null
          id: string
          nome: string
          observacoes: string | null
          reclassificada_em: string | null
          updated_at: string
        }
        Insert: {
          ano_base: number
          created_at?: string
          data_fim_vigencia?: string | null
          data_inicio_vigencia: string
          data_limite_oposicao?: string | null
          documento_url?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          reclassificada_em?: string | null
          updated_at?: string
        }
        Update: {
          ano_base?: number
          created_at?: string
          data_fim_vigencia?: string | null
          data_inicio_vigencia?: string
          data_limite_oposicao?: string | null
          documento_url?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          reclassificada_em?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          capital_social: number | null
          cnpj_basico: string
          created_at: string
          natureza_juridica: string | null
          porte: string | null
          qualificacao_responsavel: string | null
          razao_social: string
          updated_at: string
        }
        Insert: {
          capital_social?: number | null
          cnpj_basico: string
          created_at?: string
          natureza_juridica?: string | null
          porte?: string | null
          qualificacao_responsavel?: string | null
          razao_social: string
          updated_at?: string
        }
        Update: {
          capital_social?: number | null
          cnpj_basico?: string
          created_at?: string
          natureza_juridica?: string | null
          porte?: string | null
          qualificacao_responsavel?: string | null
          razao_social?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_natureza_juridica_fkey"
            columns: ["natureza_juridica"]
            isOneToOne: false
            referencedRelation: "naturezas_juridicas"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "empresas_qualificacao_responsavel_fkey"
            columns: ["qualificacao_responsavel"]
            isOneToOne: false
            referencedRelation: "qualificacoes_responsavel"
            referencedColumns: ["codigo"]
          },
        ]
      }
      estabelecimentos: {
        Row: {
          bairro: string | null
          cep: string | null
          cnae_principal: string | null
          cnpj_basico: string
          cnpj_completo: string | null
          cnpj_dv: string
          cnpj_ordem: string
          complemento: string | null
          convencao_id: string | null
          created_at: string
          data_inicio_atividades: string | null
          data_situacao_cadastral: string | null
          data_situacao_especial: string | null
          ddd_1: string | null
          ddd_2: string | null
          email: string | null
          id: string
          logradouro: string | null
          matriz_filial: number | null
          motivo_situacao: string | null
          municipio_id: number | null
          nome_fantasia: string | null
          numero: string | null
          situacao_cadastral: string | null
          situacao_especial: string | null
          telefone_1: string | null
          telefone_2: string | null
          tipo_logradouro: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cnae_principal?: string | null
          cnpj_basico: string
          cnpj_completo?: string | null
          cnpj_dv: string
          cnpj_ordem: string
          complemento?: string | null
          convencao_id?: string | null
          created_at?: string
          data_inicio_atividades?: string | null
          data_situacao_cadastral?: string | null
          data_situacao_especial?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          matriz_filial?: number | null
          motivo_situacao?: string | null
          municipio_id?: number | null
          nome_fantasia?: string | null
          numero?: string | null
          situacao_cadastral?: string | null
          situacao_especial?: string | null
          telefone_1?: string | null
          telefone_2?: string | null
          tipo_logradouro?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cnae_principal?: string | null
          cnpj_basico?: string
          cnpj_completo?: string | null
          cnpj_dv?: string
          cnpj_ordem?: string
          complemento?: string | null
          convencao_id?: string | null
          created_at?: string
          data_inicio_atividades?: string | null
          data_situacao_cadastral?: string | null
          data_situacao_especial?: string | null
          ddd_1?: string | null
          ddd_2?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          matriz_filial?: number | null
          motivo_situacao?: string | null
          municipio_id?: number | null
          nome_fantasia?: string | null
          numero?: string | null
          situacao_cadastral?: string | null
          situacao_especial?: string | null
          telefone_1?: string | null
          telefone_2?: string | null
          tipo_logradouro?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_cnae_principal_fkey"
            columns: ["cnae_principal"]
            isOneToOne: false
            referencedRelation: "cnaes"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "estabelecimentos_cnpj_basico_fkey"
            columns: ["cnpj_basico"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["cnpj_basico"]
          },
          {
            foreignKeyName: "estabelecimentos_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "convencoes_coletivas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estabelecimentos_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["convencao_id"]
          },
          {
            foreignKeyName: "estabelecimentos_motivo_situacao_fkey"
            columns: ["motivo_situacao"]
            isOneToOne: false
            referencedRelation: "motivos_situacao_cadastral"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "estabelecimentos_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estabelecimentos_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "v_dash_mapa"
            referencedColumns: ["municipio_id"]
          },
        ]
      }
      eventos_nivel: {
        Row: {
          created_at: string
          id: number
          nivel_anterior: Database["public"]["Enums"]["nivel_protecao"] | null
          nivel_novo: Database["public"]["Enums"]["nivel_protecao"]
          origem: string
          trabalhador_id: string
        }
        Insert: {
          created_at?: string
          id?: never
          nivel_anterior?: Database["public"]["Enums"]["nivel_protecao"] | null
          nivel_novo: Database["public"]["Enums"]["nivel_protecao"]
          origem?: string
          trabalhador_id: string
        }
        Update: {
          created_at?: string
          id?: never
          nivel_anterior?: Database["public"]["Enums"]["nivel_protecao"] | null
          nivel_novo?: Database["public"]["Enums"]["nivel_protecao"]
          origem?: string
          trabalhador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_nivel_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_nivel_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "eventos_nivel_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "eventos_nivel_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      faturas: {
        Row: {
          boleto_codigo: string | null
          boleto_url: string | null
          competencia: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          forma_cobranca: Database["public"]["Enums"]["forma_cobranca"]
          id: string
          observacoes: string | null
          origem_baixa: Database["public"]["Enums"]["origem_baixa"]
          repasse_id: string | null
          status: Database["public"]["Enums"]["status_fatura"]
          tipo: Database["public"]["Enums"]["tipo_fatura"]
          trabalhador_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          boleto_codigo?: string | null
          boleto_url?: string | null
          competencia: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_cobranca?: Database["public"]["Enums"]["forma_cobranca"]
          id?: string
          observacoes?: string | null
          origem_baixa?: Database["public"]["Enums"]["origem_baixa"]
          repasse_id?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          tipo: Database["public"]["Enums"]["tipo_fatura"]
          trabalhador_id: string
          updated_at?: string
          valor: number
        }
        Update: {
          boleto_codigo?: string | null
          boleto_url?: string | null
          competencia?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          forma_cobranca?: Database["public"]["Enums"]["forma_cobranca"]
          id?: string
          observacoes?: string | null
          origem_baixa?: Database["public"]["Enums"]["origem_baixa"]
          repasse_id?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          tipo?: Database["public"]["Enums"]["tipo_fatura"]
          trabalhador_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_repasse_id_fkey"
            columns: ["repasse_id"]
            isOneToOne: false
            referencedRelation: "repasses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "faturas_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "faturas_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      importacoes_csv: {
        Row: {
          arquivo_nome: string
          atualizados: number
          created_at: string
          entidade: string
          erros: Json | null
          id: string
          importado_por: string | null
          inseridos: number
          total_linhas: number
        }
        Insert: {
          arquivo_nome: string
          atualizados?: number
          created_at?: string
          entidade: string
          erros?: Json | null
          id?: string
          importado_por?: string | null
          inseridos?: number
          total_linhas?: number
        }
        Update: {
          arquivo_nome?: string
          atualizados?: number
          created_at?: string
          entidade?: string
          erros?: Json | null
          id?: string
          importado_por?: string | null
          inseridos?: number
          total_linhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_csv_importado_por_fkey"
            columns: ["importado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      motivos_situacao_cadastral: {
        Row: {
          codigo: string
          descricao: string
        }
        Insert: {
          codigo: string
          descricao: string
        }
        Update: {
          codigo?: string
          descricao?: string
        }
        Relationships: []
      }
      municipios: {
        Row: {
          base_territorial: boolean
          codigo_ibge: number | null
          codigo_rfb: number | null
          id: number
          nome: string
          sede: boolean
          uf: string
        }
        Insert: {
          base_territorial?: boolean
          codigo_ibge?: number | null
          codigo_rfb?: number | null
          id?: number
          nome: string
          sede?: boolean
          uf: string
        }
        Update: {
          base_territorial?: boolean
          codigo_ibge?: number | null
          codigo_rfb?: number | null
          id?: number
          nome?: string
          sede?: boolean
          uf?: string
        }
        Relationships: []
      }
      naturezas_juridicas: {
        Row: {
          codigo: string
          descricao: string
        }
        Insert: {
          codigo: string
          descricao: string
        }
        Update: {
          codigo?: string
          descricao?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string
          destinatario_perfil_id: string | null
          destinatario_role: Database["public"]["Enums"]["papel_usuario"] | null
          id: string
          lida: boolean
          mensagem: string | null
          referencia_id: string | null
          referencia_tabela: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          created_at?: string
          destinatario_perfil_id?: string | null
          destinatario_role?:
            | Database["public"]["Enums"]["papel_usuario"]
            | null
          id?: string
          lida?: boolean
          mensagem?: string | null
          referencia_id?: string | null
          referencia_tabela?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          created_at?: string
          destinatario_perfil_id?: string | null
          destinatario_role?:
            | Database["public"]["Enums"]["papel_usuario"]
            | null
          id?: string
          lida?: boolean
          mensagem?: string | null
          referencia_id?: string | null
          referencia_tabela?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_destinatario_perfil_id_fkey"
            columns: ["destinatario_perfil_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          cnpj: string | null
          contato_email: string | null
          contato_nome: string | null
          contato_whatsapp: string | null
          created_at: string
          data_fim_contrato: string | null
          data_inicio_contrato: string | null
          id: string
          nome: string
          observacoes: string | null
          segmento: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_whatsapp?: string | null
          created_at?: string
          data_fim_contrato?: string | null
          data_inicio_contrato?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          segmento?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          contato_email?: string | null
          contato_nome?: string | null
          contato_whatsapp?: string | null
          created_at?: string
          data_fim_contrato?: string | null
          data_inicio_contrato?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          segmento?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          parceiro_id: string | null
          role: Database["public"]["Enums"]["papel_usuario"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
          parceiro_id?: string | null
          role: Database["public"]["Enums"]["papel_usuario"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          parceiro_id?: string | null
          role?: Database["public"]["Enums"]["papel_usuario"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfis_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfis_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_dash_top_parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      pisos_convencao: {
        Row: {
          convencao_id: string
          funcao: string | null
          id: string
          valor: number
        }
        Insert: {
          convencao_id: string
          funcao?: string | null
          id?: string
          valor: number
        }
        Update: {
          convencao_id?: string
          funcao?: string | null
          id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pisos_convencao_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "convencoes_coletivas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pisos_convencao_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["convencao_id"]
          },
        ]
      }
      qualificacoes_responsavel: {
        Row: {
          codigo: string
          descricao: string
        }
        Insert: {
          codigo: string
          descricao: string
        }
        Update: {
          codigo?: string
          descricao?: string
        }
        Relationships: []
      }
      recepcionistas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          parceiro_id: string
          pin_hash: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          parceiro_id: string
          pin_hash: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          parceiro_id?: string
          pin_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recepcionistas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recepcionistas_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_dash_top_parceiros"
            referencedColumns: ["id"]
          },
        ]
      }
      repasses: {
        Row: {
          cnpj_basico: string
          competencia: string
          comprovante_url: string | null
          created_at: string
          data_vencimento: string | null
          email_enviado_em: string | null
          email_enviado_para: string | null
          id: string
          nominal: boolean
          numero_guia_pagamento: string | null
          observacoes: string | null
          pdf_url: string | null
          recebido_em: string | null
          registrado_por: string | null
          status: Database["public"]["Enums"]["status_repasse"]
          tipo: Database["public"]["Enums"]["tipo_fatura"]
          updated_at: string
          valor_total: number
        }
        Insert: {
          cnpj_basico: string
          competencia: string
          comprovante_url?: string | null
          created_at?: string
          data_vencimento?: string | null
          email_enviado_em?: string | null
          email_enviado_para?: string | null
          id?: string
          nominal?: boolean
          numero_guia_pagamento?: string | null
          observacoes?: string | null
          pdf_url?: string | null
          recebido_em?: string | null
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_repasse"]
          tipo: Database["public"]["Enums"]["tipo_fatura"]
          updated_at?: string
          valor_total: number
        }
        Update: {
          cnpj_basico?: string
          competencia?: string
          comprovante_url?: string | null
          created_at?: string
          data_vencimento?: string | null
          email_enviado_em?: string | null
          email_enviado_para?: string | null
          id?: string
          nominal?: boolean
          numero_guia_pagamento?: string | null
          observacoes?: string | null
          pdf_url?: string | null
          recebido_em?: string | null
          registrado_por?: string | null
          status?: Database["public"]["Enums"]["status_repasse"]
          tipo?: Database["public"]["Enums"]["tipo_fatura"]
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "repasses_cnpj_basico_fkey"
            columns: ["cnpj_basico"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["cnpj_basico"]
          },
          {
            foreignKeyName: "repasses_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      snapshots_dashboard: {
        Row: {
          created_at: string
          data_ref: string
          id: number
          mrr_contribuicoes: number | null
          mrr_mensalidades: number | null
          municipio_id: number | null
          nivel: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores: number
        }
        Insert: {
          created_at?: string
          data_ref: string
          id?: never
          mrr_contribuicoes?: number | null
          mrr_mensalidades?: number | null
          municipio_id?: number | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores?: number
        }
        Update: {
          created_at?: string
          data_ref?: string
          id?: never
          mrr_contribuicoes?: number | null
          mrr_mensalidades?: number | null
          municipio_id?: number | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores?: number
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_dashboard_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snapshots_dashboard_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "v_dash_mapa"
            referencedColumns: ["municipio_id"]
          },
        ]
      }
      solicitacoes_admin: {
        Row: {
          analisada_em: string | null
          analisada_por: string | null
          created_at: string
          id: string
          justificativa: string | null
          observacao_analise: string | null
          operacao: Database["public"]["Enums"]["operacao_auditoria"]
          payload: Json | null
          registro_id: string | null
          solicitante: string
          status: Database["public"]["Enums"]["status_solicitacao_admin"]
          tabela_alvo: string
          updated_at: string
        }
        Insert: {
          analisada_em?: string | null
          analisada_por?: string | null
          created_at?: string
          id?: string
          justificativa?: string | null
          observacao_analise?: string | null
          operacao: Database["public"]["Enums"]["operacao_auditoria"]
          payload?: Json | null
          registro_id?: string | null
          solicitante: string
          status?: Database["public"]["Enums"]["status_solicitacao_admin"]
          tabela_alvo: string
          updated_at?: string
        }
        Update: {
          analisada_em?: string | null
          analisada_por?: string | null
          created_at?: string
          id?: string
          justificativa?: string | null
          observacao_analise?: string | null
          operacao?: Database["public"]["Enums"]["operacao_auditoria"]
          payload?: Json | null
          registro_id?: string | null
          solicitante?: string
          status?: Database["public"]["Enums"]["status_solicitacao_admin"]
          tabela_alvo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_admin_analisada_por_fkey"
            columns: ["analisada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_admin_solicitante_fkey"
            columns: ["solicitante"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_servico: {
        Row: {
          beneficiado_id: string | null
          beneficio_id: string
          checkin_em: string | null
          checkin_justificativa: string | null
          checkin_por: string | null
          confirmada_em: string | null
          confirmada_por: string | null
          created_at: string
          data_agendada: string
          horario: string | null
          id: string
          motivo_rejeicao: string | null
          numero_guia: string
          observacoes: string | null
          parceiro_id: string
          registrada_por: string | null
          resolucao_analise: string | null
          status: Database["public"]["Enums"]["status_solicitacao"]
          token_publico: string
          trabalhador_id: string
          updated_at: string
          valor_convenio: number | null
          valor_particular: number | null
        }
        Insert: {
          beneficiado_id?: string | null
          beneficio_id: string
          checkin_em?: string | null
          checkin_justificativa?: string | null
          checkin_por?: string | null
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          data_agendada: string
          horario?: string | null
          id?: string
          motivo_rejeicao?: string | null
          numero_guia?: string
          observacoes?: string | null
          parceiro_id: string
          registrada_por?: string | null
          resolucao_analise?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          token_publico?: string
          trabalhador_id: string
          updated_at?: string
          valor_convenio?: number | null
          valor_particular?: number | null
        }
        Update: {
          beneficiado_id?: string | null
          beneficio_id?: string
          checkin_em?: string | null
          checkin_justificativa?: string | null
          checkin_por?: string | null
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          data_agendada?: string
          horario?: string | null
          id?: string
          motivo_rejeicao?: string | null
          numero_guia?: string
          observacoes?: string | null
          parceiro_id?: string
          registrada_por?: string | null
          resolucao_analise?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao"]
          token_publico?: string
          trabalhador_id?: string
          updated_at?: string
          valor_convenio?: number | null
          valor_particular?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_servico_beneficiado_id_fkey"
            columns: ["beneficiado_id"]
            isOneToOne: false
            referencedRelation: "beneficiados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_beneficio_id_fkey"
            columns: ["beneficio_id"]
            isOneToOne: false
            referencedRelation: "beneficios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_checkin_por_fkey"
            columns: ["checkin_por"]
            isOneToOne: false
            referencedRelation: "recepcionistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_confirmada_por_fkey"
            columns: ["confirmada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "v_dash_top_parceiros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "solicitacoes_servico_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
      taxas_convencao: {
        Row: {
          convencao_id: string
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          valor: number | null
        }
        Insert: {
          convencao_id: string
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          valor?: number | null
        }
        Update: {
          convencao_id?: string
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "taxas_convencao_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "convencoes_coletivas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxas_convencao_convencao_id_fkey"
            columns: ["convencao_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["convencao_id"]
          },
        ]
      }
      trabalhadores: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          cpf: string
          created_at: string
          data_filiacao: string | null
          data_nascimento: string | null
          email: string | null
          forma_pagamento_preferida: Database["public"]["Enums"]["forma_cobranca"]
          id: string
          municipio_id: number | null
          nivel: Database["public"]["Enums"]["nivel_protecao"] | null
          nome: string
          observacao_aprovacao: string | null
          observacoes: string | null
          origem_cadastro: Database["public"]["Enums"]["origem_cadastro"]
          recolhe_contribuicao_sindical: boolean
          recolhe_mensalidade_convenio: boolean
          status_cadastro: Database["public"]["Enums"]["status_cadastro"]
          telefone_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cpf: string
          created_at?: string
          data_filiacao?: string | null
          data_nascimento?: string | null
          email?: string | null
          forma_pagamento_preferida?: Database["public"]["Enums"]["forma_cobranca"]
          id?: string
          municipio_id?: number | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          nome: string
          observacao_aprovacao?: string | null
          observacoes?: string | null
          origem_cadastro?: Database["public"]["Enums"]["origem_cadastro"]
          recolhe_contribuicao_sindical?: boolean
          recolhe_mensalidade_convenio?: boolean
          status_cadastro?: Database["public"]["Enums"]["status_cadastro"]
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          cpf?: string
          created_at?: string
          data_filiacao?: string | null
          data_nascimento?: string | null
          email?: string | null
          forma_pagamento_preferida?: Database["public"]["Enums"]["forma_cobranca"]
          id?: string
          municipio_id?: number | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          nome?: string
          observacao_aprovacao?: string | null
          observacoes?: string | null
          origem_cadastro?: Database["public"]["Enums"]["origem_cadastro"]
          recolhe_contribuicao_sindical?: boolean
          recolhe_mensalidade_convenio?: boolean
          status_cadastro?: Database["public"]["Enums"]["status_cadastro"]
          telefone_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trabalhadores_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabalhadores_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "municipios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trabalhadores_municipio_id_fkey"
            columns: ["municipio_id"]
            isOneToOne: false
            referencedRelation: "v_dash_mapa"
            referencedColumns: ["municipio_id"]
          },
        ]
      }
      vinculos_empregaticios: {
        Row: {
          created_at: string
          data_admissao: string | null
          data_desligamento: string | null
          estabelecimento_id: string
          funcao: string | null
          id: string
          principal: boolean
          salario_informado: number | null
          trabalhador_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          estabelecimento_id: string
          funcao?: string | null
          id?: string
          principal?: boolean
          salario_informado?: number | null
          trabalhador_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_admissao?: string | null
          data_desligamento?: string | null
          estabelecimento_id?: string
          funcao?: string | null
          id?: string
          principal?: boolean
          salario_informado?: number | null
          trabalhador_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_empregaticios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["estabelecimento_id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "trabalhadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_base_calculo_trabalhador"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_mensalidade_titular"
            referencedColumns: ["trabalhador_id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_trabalhador_id_fkey"
            columns: ["trabalhador_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["trabalhador_id"]
          },
        ]
      }
    }
    Views: {
      v_base_calculo_trabalhador: {
        Row: {
          cnpj_basico: string | null
          cpf: string | null
          estabelecimento_id: string | null
          forma_pagamento_preferida:
            | Database["public"]["Enums"]["forma_cobranca"]
            | null
          nivel: Database["public"]["Enums"]["nivel_protecao"] | null
          salario_base: number | null
          trabalhador_id: string | null
          valor_contribuicao_anual: number | null
          vinculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_cnpj_basico_fkey"
            columns: ["cnpj_basico"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["cnpj_basico"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "estabelecimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_empregaticios_estabelecimento_id_fkey"
            columns: ["estabelecimento_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_convencao"
            referencedColumns: ["estabelecimento_id"]
          },
        ]
      }
      v_dash_conversoes_mensais: {
        Row: {
          bronze_para_ouro: number | null
          bronze_para_prata: number | null
          mes: string | null
          novos_cadastros: number | null
          prata_para_ouro: number | null
          regressoes: number | null
        }
        Relationships: []
      }
      v_dash_dicas: {
        Row: {
          codigo: string | null
          detalhe: string | null
          quantidade: number | null
          rota: string | null
          severidade: string | null
          titulo: string | null
        }
        Relationships: []
      }
      v_dash_evolucao_niveis: {
        Row: {
          data_ref: string | null
          nivel: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores: number | null
        }
        Insert: {
          data_ref?: string | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores?: number | null
        }
        Update: {
          data_ref?: string | null
          nivel?: Database["public"]["Enums"]["nivel_protecao"] | null
          qtd_trabalhadores?: number | null
        }
        Relationships: []
      }
      v_dash_kpis: {
        Row: {
          boletos_inadimplentes: number | null
          bronze: number | null
          cadastros_pendentes: number | null
          fila_admin_pendente: number | null
          guias_em_atraso: number | null
          mrr_contribuicoes: number | null
          mrr_mensalidades: number | null
          novos_30d: number | null
          ouro: number | null
          prata: number | null
          total_trabalhadores: number | null
          valor_boletos_inadimplentes: number | null
          valor_guias_em_atraso: number | null
        }
        Relationships: []
      }
      v_dash_mapa: {
        Row: {
          bronze: number | null
          codigo_ibge: number | null
          estabelecimentos_ativos: number | null
          municipio_id: number | null
          nome: string | null
          ouro: number | null
          prata: number | null
          sede: boolean | null
          total_trabalhadores: number | null
        }
        Relationships: []
      }
      v_dash_receita_mensal: {
        Row: {
          mes: string | null
          receita_pendente: number | null
          receita_realizada: number | null
          tipo: Database["public"]["Enums"]["tipo_fatura"] | null
        }
        Relationships: []
      }
      v_dash_top_parceiros: {
        Row: {
          economia_gerada_90d: number | null
          executadas_90d: number | null
          id: string | null
          nome: string | null
          pendentes_confirmacao: number | null
          rejeitadas_90d: number | null
        }
        Relationships: []
      }
      v_fila_parceiro: {
        Row: {
          categoria: string | null
          checkin_em: string | null
          created_at: string | null
          data_agendada: string | null
          horario: string | null
          id: string | null
          interessado: string | null
          motivo_rejeicao: string | null
          numero_guia: string | null
          servico: string | null
          status: Database["public"]["Enums"]["status_solicitacao"] | null
          tipo_interessado: string | null
          valor_convenio: number | null
          valor_particular: number | null
        }
        Relationships: []
      }
      v_mensalidade_titular: {
        Row: {
          cnpj_basico: string | null
          cpf: string | null
          forma_pagamento_preferida:
            | Database["public"]["Enums"]["forma_cobranca"]
            | null
          n_beneficiados_adicionais: number | null
          n_beneficiados_diretos: number | null
          n_beneficiados_indiretos: number | null
          salario_base: number | null
          trabalhador_id: string | null
          valor_mensalidade: number | null
        }
        Relationships: [
          {
            foreignKeyName: "estabelecimentos_cnpj_basico_fkey"
            columns: ["cnpj_basico"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["cnpj_basico"]
          },
        ]
      }
      v_relatorio_convencao: {
        Row: {
          ano_base: number | null
          convencao: string | null
          convencao_id: string | null
          cpf: string | null
          empresa: string | null
          estabelecimento: string | null
          estabelecimento_id: string | null
          forma_pagamento_preferida:
            | Database["public"]["Enums"]["forma_cobranca"]
            | null
          nivel: Database["public"]["Enums"]["nivel_protecao"] | null
          reclassificada_em: string | null
          trabalhador: string | null
          trabalhador_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      fn_config: {
        Args: { p_chave: string; p_default: string }
        Returns: string
      }
      fn_dados_guia_publica: {
        Args: { p_token: string }
        Returns: {
          data_agendada: string
          horario: string
          interessado: string
          numero_guia: string
          parceiro: string
          servico: string
          status: Database["public"]["Enums"]["status_solicitacao"]
          valor_convenio: number
          valor_particular: number
        }[]
      }
      fn_eh: {
        Args: { p_roles: Database["public"]["Enums"]["papel_usuario"][] }
        Returns: boolean
      }
      fn_evoluir_solicitacoes: { Args: never; Returns: number }
      fn_gera_guia_pagamento: { Args: never; Returns: string }
      fn_gera_numero_guia: { Args: never; Returns: string }
      fn_guarda_job: { Args: never; Returns: undefined }
      fn_marcar_boletos_inadimplentes: { Args: never; Returns: number }
      fn_marcar_guias_em_atraso: { Args: never; Returns: number }
      fn_parceiro_id: { Args: never; Returns: string }
      fn_reclassificar_convencao: {
        Args: { p_convencao_id: string }
        Returns: {
          para_bronze: number
          para_prata: number
        }[]
      }
      fn_registrar_checkin: {
        Args: {
          p_atendido: boolean
          p_justificativa?: string
          p_pin: string
          p_token: string
        }
        Returns: Json
      }
      fn_role: {
        Args: never
        Returns: Database["public"]["Enums"]["papel_usuario"]
      }
      fn_snapshot_dashboard: { Args: never; Returns: undefined }
      fn_titular_bloqueado: {
        Args: {
          p_tipo: Database["public"]["Enums"]["tipo_fatura"]
          p_trabalhador_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      forma_cobranca: "holerite" | "boleto_direto"
      forma_entrega_carta: "presencial" | "email" | "correio" | "outro"
      nivel_protecao: "bronze" | "prata" | "ouro"
      operacao_auditoria: "INSERT" | "UPDATE" | "DELETE"
      origem_baixa: "manual" | "integracao"
      origem_cadastro: "formulario_site" | "manual" | "csv" | "agente_whatsapp"
      papel_usuario:
        | "admin"
        | "presidente"
        | "secretaria"
        | "juridico"
        | "parceiro"
      status_cadastro: "pendente" | "aprovado" | "rejeitado" | "inativo"
      status_fatura: "aberta" | "paga" | "inadimplente" | "isenta" | "cancelada"
      status_repasse: "previsto" | "enviado" | "recebido" | "em_atraso"
      status_solicitacao:
        | "solicitada"
        | "pendente_confirmacao"
        | "executada"
        | "rejeitada"
        | "cancelada"
      status_solicitacao_admin:
        | "pendente"
        | "aprovada"
        | "rejeitada"
        | "cancelada"
      tipo_atend_juridico: "orientacao" | "homologacao" | "processo" | "outro"
      tipo_beneficiado: "direto" | "indireto" | "adicional"
      tipo_fatura:
        | "contribuicao_sindical"
        | "mensalidade_convenio"
        | "multa"
        | "acordo"
        | "taxa_adicional"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      forma_cobranca: ["holerite", "boleto_direto"],
      forma_entrega_carta: ["presencial", "email", "correio", "outro"],
      nivel_protecao: ["bronze", "prata", "ouro"],
      operacao_auditoria: ["INSERT", "UPDATE", "DELETE"],
      origem_baixa: ["manual", "integracao"],
      origem_cadastro: ["formulario_site", "manual", "csv", "agente_whatsapp"],
      papel_usuario: [
        "admin",
        "presidente",
        "secretaria",
        "juridico",
        "parceiro",
      ],
      status_cadastro: ["pendente", "aprovado", "rejeitado", "inativo"],
      status_fatura: ["aberta", "paga", "inadimplente", "isenta", "cancelada"],
      status_repasse: ["previsto", "enviado", "recebido", "em_atraso"],
      status_solicitacao: [
        "solicitada",
        "pendente_confirmacao",
        "executada",
        "rejeitada",
        "cancelada",
      ],
      status_solicitacao_admin: [
        "pendente",
        "aprovada",
        "rejeitada",
        "cancelada",
      ],
      tipo_atend_juridico: ["orientacao", "homologacao", "processo", "outro"],
      tipo_beneficiado: ["direto", "indireto", "adicional"],
      tipo_fatura: [
        "contribuicao_sindical",
        "mensalidade_convenio",
        "multa",
        "acordo",
        "taxa_adicional",
      ],
    },
  },
} as const
