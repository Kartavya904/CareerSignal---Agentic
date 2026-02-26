-- Add self-referential FK for companies.parent_company_id -> companies.id
-- (omitted from schema to avoid TypeScript circular reference)
ALTER TABLE "companies" ADD CONSTRAINT "companies_parent_company_id_fkey" 
  FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id") ON DELETE SET NULL;
