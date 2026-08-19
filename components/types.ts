export type ProspectStatus =
  | "Nouveau"
  | "À rappeler"
  | "RDV pris"
  | "Client"
  | "Perdu";

export type Prospect = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  treatment: string;
  campaign: string;
  source: string;
  status: ProspectStatus;
  commercial: string;
  nextContact: string;
  createdAt: string;
  comments: number;
};
