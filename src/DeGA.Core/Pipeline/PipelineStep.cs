using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    internal record PipelineStep<TDefinition>(
        Func<IPipelineContext, TDefinition> DefinitionFactory) : IPipelineStep
            where TDefinition : IActionDefinition
    {

    }
}
