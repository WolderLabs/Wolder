using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core.New
{
    public class PipelineActionContext
    {
        internal Task WriteFileAsync(string path, string content)
        {
            return Task.CompletedTask;
        }
    }
}
