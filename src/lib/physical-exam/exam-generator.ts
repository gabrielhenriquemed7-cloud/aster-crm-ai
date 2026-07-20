import { buildPhysicalExamText } from "@/lib/physical-exam/service";
import type {
  ExamTemplate,
  PhysicalExamSystems,
} from "@/lib/physical-exam/types";

export class ExamGenerator {
  constructor(private readonly template: ExamTemplate) {}

  generate(systems: PhysicalExamSystems, observations: string) {
    return buildPhysicalExamText(this.template, systems, observations);
  }
}
