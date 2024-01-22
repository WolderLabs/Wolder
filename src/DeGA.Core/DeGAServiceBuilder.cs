using Microsoft.Extensions.DependencyInjection;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DeGA.Core
{
    public sealed record DeGAServiceBuilder(IServiceCollection Services)
    {
    }
}
