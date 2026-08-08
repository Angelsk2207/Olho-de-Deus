import React from 'react';
import LeadDashboard from './components/LeadDashboard';

export default function App() {
  // Modo de teste aberto: sem Google, pop-ups ou login.
  // O acesso privado será acrescentado depois no painel de administrador.
  return <LeadDashboard token="" userEmail="Modo de teste" />;
}
