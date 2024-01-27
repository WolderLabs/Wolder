using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    internal record PipelineStep<TParameters, TAction>(
        Func<IPipelineContext, TParameters> ParametersFactory) : IPipelineStep
            where TParameters : IActionInputParameters
            where TAction : IPipelineAction<TParameters> 
    {

    }
}
